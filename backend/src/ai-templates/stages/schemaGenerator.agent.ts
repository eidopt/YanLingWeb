import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ThemeLayoutDocument, ThemeLayoutNode } from '@shared/agent/contracts/agent';
import type { AIProvider } from '@shared/agent/contracts/provider';
import { CORE_COMPONENTS, STAGE_SCHEMA_GENERATOR_SYSTEM_PROMPT } from '@shared/agent/runtime';
import { migrateThemeLayoutDocument } from '@shared/theme-layout/migrations';
import {
  applyVisualAssetsToLayoutDocument,
  normalizeVisualAssets,
} from '@shared/theme-layout/visualAssets';

import {
  AI_TEMPLATE_PIPELINE_PROVIDER,
  type AiTemplatePipelineProvider,
} from '../../ai/pipelineProvider.port';
import { validateGeneratedTemplateLayout } from '../../templates/templateLayoutValidation';
import type {
  DesignerOutput,
  PipelineStageRecord,
  SchemaOutput,
} from '../orchestrator/pipeline.types';
import { runStructuredStage, type StageRunUsage } from '../orchestrator/runStage';
import {
  SUBMIT_NODE_CONTENT_TOOL,
  SUBMIT_PAGE_SKELETON_TOOL,
  SUBMIT_VISUAL_ASSETS_TOOL,
} from '../tools/schemaStep.tools';
import { preValidateAndFix } from './preValidateFix';

// 叶子节点 alias — 用于 parser 判断容器 vs 叶子
const LEAF_NODE_ALIASES = new Set([
  'text',
  'button',
  'image',
  'tag',
  'progress',
  'divider',
  'spacer',
  'input',
  'tabs',
  'search',
  'notice',
  'widget',
  'tabbar',
  'statistic',
  'avatar',
  'badge',
  'breadcrumb',
  'pagination',
  'empty',
  'skeleton',
  'select',
  'checkbox',
  'radio',
  'switch',
  'rate',
  'slider',
  'datepicker',
  'timepicker',
  'upload',
  'toast',
  'alert',
  'loading',
  'video',
  'audio',
  'tooltip',
  'carousel',
  'table',
]);

const CONTAINER_ALIASES = new Set([
  'screen',
  'panel',
  'stack',
  'row',
  'grid',
  'html',
  'navbar',
  'list',
  'list-item',
  'dialog',
  'drawer',
  'collapse',
  'sidebar',
  'form',
  'toolbar',
  'splitter',
  'timeline',
  'tree',
]);

/** LLM 常编造的非法 alias → 映射为合法 alias */
const ALIAS_FIXUP: Record<string, string> = {
  title: 'text',
  desc: 'text',
  description: 'text',
  content: 'text',
  subtitle: 'text',
  name: 'text',
  label: 'tag',
  header: 'navbar',
  footer: 'tabs',
  foot: 'tabs',
  'bottom-nav': 'tabs',
  card: 'panel',
  cards: 'panel',
  'product-card': 'panel',
  'item-card': 'panel',
  menu: 'list',
  menus: 'list',
  'food-card': 'panel',
  'food-cards': 'grid',
  'category-card': 'panel',
  'category-cards': 'grid',
  categories: 'row',
  banner: 'image',
  hero: 'image',
  'avatar-image': 'image',
  'search-bar': 'search',
  'input-box': 'input',
  'text-input': 'input',
  cta: 'button',
  'primary-button': 'button',
  'action-button': 'button',
  'icon-grid': 'grid',
  'function-grid': 'grid',
  'grid-menu': 'grid',
  status: 'tag',
  'badge-tag': 'tag',
  'price-tag': 'tag',
  rating: 'statistic',
  'progress-bar': 'progress',
  stats: 'statistic',
  'divider-line': 'divider',
  spacing: 'spacer',
  'empty-state': 'empty',
  'loading-state': 'loading',
  'tab-navigation': 'tabs',
  'bottom-tabs': 'tabs',
  'carousel-slider': 'carousel',
  'image-slider': 'carousel',
  'form-input': 'input',
  'date-input': 'datepicker',
  'time-input': 'timepicker',
  'file-upload': 'upload',
  'select-dropdown': 'select',
  'switch-toggle': 'switch',
  'checkbox-input': 'checkbox',
  'radio-group': 'radio',
  'toast-notification': 'toast',
  'alert-message': 'alert',
  'tooltip-hint': 'tooltip',
  'video-player': 'video',
  'audio-player': 'audio',
};

interface PageSkeleton {
  id: string;
  name: string;
  kind: string;
  /** 容器层级描述：如 "screen>search,panel(text,button),tabs" */
  containerTree: string;
}

interface SkeletonPhaseResult {
  templateId: string;
  pages: PageSkeleton[];
  componentTemplateAliases: string[];
  cssVars: Record<string, string>;
  tokens: StageRunUsage;
}

interface SkeletonNodeSpec {
  nodeId: string;
  alias: string;
  parentId?: string;
  slot?: 'footer';
}

interface BuiltPageSkeleton {
  id: string;
  name: string;
  kind: string;
  layout: ThemeLayoutNode;
  nodes: SkeletonNodeSpec[];
}

interface PageNodeContentFill {
  pageId: string;
  nodes: { nodeId: string; props: Record<string, unknown> }[];
}

interface ContentPhaseResult {
  pages: PageNodeContentFill[];
  tokens: StageRunUsage;
}

interface ImageNodeSpec {
  nodeId: string;
  pageId: string;
  alt?: string;
}

interface AssetsPhaseResult {
  assets: Record<string, unknown>[];
  tokens: StageRunUsage;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asStringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }
  const output: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    if (typeof v === 'string' && v.trim().length > 0) {
      output[k] = v.trim();
    }
  }
  return output;
}

function sumStageUsage(...usages: readonly StageRunUsage[]): StageRunUsage {
  return usages.reduce<StageRunUsage>(
    (acc, item) => ({
      inputTokens: acc.inputTokens + item.inputTokens,
      outputTokens: acc.outputTokens + item.outputTokens,
      cacheHitTokens: acc.cacheHitTokens + item.cacheHitTokens,
    }),
    { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0 },
  );
}

/**
 * Stage 3 — Schema Generator (三阶段生成)
 *
 * Phase A: 生成页面骨架（容器层级文本描述，LLM 输出极小）
 * Tree Build: 程序化展开骨架树并分配全局唯一节点 ID
 * Phase B: 基于真实 nodeId 清单为每个页面填充节点 props
 * Phase C: 基于真实 core.image nodeId 清单生成 visual assets
 * Assembly: 合并、应用 visualAssets、自动修复并做成品校验
 */
@Injectable()
export class SchemaGeneratorAgent {
  private readonly logger = new Logger(SchemaGeneratorAgent.name);

  constructor(
    @Inject(AI_TEMPLATE_PIPELINE_PROVIDER)
    private readonly aiProvider: AiTemplatePipelineProvider,
  ) {}

  async run(brief: DesignerOutput, attempt: number): Promise<PipelineStageRecord<SchemaOutput>> {
    const start = Date.now();
    const { provider, model, apiKeyConfigured } = this.aiProvider.getProviderForTemplatePipeline();
    if (!apiKeyConfigured) {
      throw new Error('AI_API_KEY 未配置');
    }

    this.logger.debug(`schema generator attempt=${attempt} brief=${brief.templateId}`);

    // Phase A: 生成页面骨架
    const skeleton = await this.phaseSkeleton(provider, model, brief);
    this.logger.debug(`phaseA: ${skeleton.pages.length} pages, ${skeleton.templateId}`);

    // Tree Build: 在 Phase B 之前先展开树并生成全局唯一真实 nodeId
    const builtPages = this.buildSkeletonTrees(skeleton.pages, brief);

    // Phase B: 按真实 nodeId 填充所有页面内容
    const contentResult = await this.phaseContent(provider, model, builtPages, brief);
    this.logger.debug(`phaseB: ${contentResult.pages.length} pages filled`);

    this.applyContentFills(builtPages, contentResult.pages, brief);

    // Phase C: 只为树中真实存在的 core.image 节点生成 visual assets
    const imageNodes = this.collectImageNodes(builtPages);
    const assets =
      imageNodes.length > 0
        ? await this.phaseAssets(provider, model, skeleton.templateId, imageNodes, brief)
        : { assets: [], tokens: { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0 } };
    this.logger.debug(`phaseC: ${assets.assets.length} visual assets`);

    // Assembly: 合并为完整文档
    const document = this.assembleDocument(skeleton, builtPages, assets.assets, brief);

    const totalTokens = sumStageUsage(skeleton.tokens, contentResult.tokens, assets.tokens);
    return {
      attempt,
      durationMs: Date.now() - start,
      inputTokens: totalTokens.inputTokens,
      outputTokens: totalTokens.outputTokens,
      cacheHitTokens: totalTokens.cacheHitTokens,
      output: { templateId: skeleton.templateId, document, rawToolInput: {} },
    };
  }

  // ─── Phase A: 页面骨架 ─────────────────────────────────────────

  private async phaseSkeleton(
    provider: AIProvider,
    model: string,
    brief: DesignerOutput,
  ): Promise<SkeletonPhaseResult> {
    const result = await runStructuredStage<Record<string, unknown>>({
      provider,
      model,
      systemPrompt: STAGE_SCHEMA_GENERATOR_SYSTEM_PROMPT,
      userMessage: [
        '**Phase A: 生成页面骨架（3-5 页）**',
        '',
        '基于 brief 输出 3-5 个页面的容器层级。每页用 layoutTree 字符串描述。',
        '',
        '格式：screen>子节点1,子节点2(子节点2的子级)',
        '示例：screen>navbar,search,panel(text,button),grid(panel(image,text),panel(image,text)),tabs',
        '',
        '约束：',
        '- 必须 3-5 个页面，页面 id/name/kind 尽量沿用 brief.pages',
        '- 每页总计 8-15 个节点（容器+叶子）',
        '- grid/list 必须有 4-6 个子节点（表示列表项）',
        '- stack 2-4 个、panel 2-4 个、row 2-3 个子节点',
        '- 每页至少 2 个 image',
        '- 移动端页面必须含 tabs（底栏导航）',
        '- 所有页面的根是 screen',
        '- 只使用这些 alias：text button image search input tabs tag notice',
        '  progress divider spacer screen panel stack row grid html navbar',
        '  tabbar list list-item dialog drawer collapse sidebar form toolbar',
        '  splitter timeline tree statistic avatar badge breadcrumb pagination',
        '  empty skeleton select checkbox radio switch rate slider upload',
        '  toast alert loading carousel video audio tooltip table',
        '',
        'brief:',
        '```json',
        JSON.stringify(brief, null, 2),
        '```',
      ].join('\n'),
      tool: SUBMIT_PAGE_SKELETON_TOOL,
      parse: (args) => {
        const pagesRaw = Array.isArray(args.pages) ? args.pages : [];
        if (pagesRaw.length === 0) {
          throw new Error('pages 不能为空');
        }
        return args;
      },
      maxIterations: 4,
    });

    const r = result.output;
    const rawPages = Array.isArray(r.pages) ? r.pages : [];
    const pages: PageSkeleton[] = rawPages.flatMap((entry, index): PageSkeleton[] => {
      const p = asRecord(entry);
      if (!p) {
        return [];
      }
      const briefPage = brief.pages.at(index);
      const id = asString(p.id) ?? briefPage?.id ?? `page-${index + 1}`;
      const name = asString(p.name) ?? briefPage?.name ?? `页面${index + 1}`;
      const kind = asString(p.kind) ?? briefPage?.kind ?? 'landing';
      const containerTree = asString(p.layoutTree) ?? 'screen>navbar,panel(text,button),tabs';
      return [{ id, name, kind, containerTree }];
    });

    const aliasesRaw = Array.isArray(r.componentTemplateAliases) ? r.componentTemplateAliases : [];
    const componentTemplateAliases = aliasesRaw.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );

    return {
      templateId: asString(r.templateId) ?? brief.templateId,
      pages,
      componentTemplateAliases,
      cssVars: asStringRecord(r.cssVars),
      tokens: result.usage,
    };
  }

  // ─── Phase B: 内容填充（基于真实 nodeId 一次性填充） ────────────

  private async phaseContent(
    provider: AIProvider,
    model: string,
    builtPages: readonly BuiltPageSkeleton[],
    brief: DesignerOutput,
  ): Promise<ContentPhaseResult> {
    const pagesSummary = builtPages.map((p) => ({
      pageId: p.id,
      name: p.name,
      kind: p.kind,
      nodes: p.nodes.map((n) => ({
        nodeId: n.nodeId,
        alias: n.alias,
        ...(n.parentId ? { parentId: n.parentId } : {}),
        ...(n.slot ? { slot: n.slot } : {}),
      })),
    }));

    const result = await runStructuredStage<Record<string, unknown>>({
      provider,
      model,
      systemPrompt: STAGE_SCHEMA_GENERATOR_SYSTEM_PROMPT,
      userMessage: [
        '**Phase B: 一次性填充所有页面内容**',
        '',
        `模板「${brief.name}」（${brief.tagline}，场景：${brief.scenario}）共 ${builtPages.length} 个页面。`,
        '请严格按下方提供的真实 nodeId 清单，为每个节点填充 props。',
        '',
        '输出格式：为每个页面输出 { pageId, nodes: [{ nodeId, alias, props }] }。',
        '重要：nodeId 必须原样复制下方清单中的 nodeId，不要自己改写或编造序号！',
        '',
        'Props 要求（所有可见文案必须使用简体中文）：',
        '  core.screen → { title:"页面中文标题" }',
        '  core.text → { text:"中文文案", variant:"heading|body|caption|title|subtitle" }',
        '  core.button → { label:"中文按钮名", variant:"primary|secondary" }',
        '  core.search → { placeholder:"中文搜索提示" }',
        '  core.image → { alt:"中文图片描述" }',
        '  core.tag → { label:"中文标签", tone:"deal|hot|new|success|info|neutral" }',
        '  core.tabs → { tabs:["首页","分类","订单"], activeTab:"当前页标签" }',
        '  core.panel → { title:"中文标题", tone:"default|accent|soft" }',
        '  core.progress → { value:50, max:100, tone:"success" }',
        '  core.input → { placeholder:"占位文字", label:"字段名" }',
        '  core.notice → { text:"中文通知", tone:"info|warning" }',
        '  core.navbar → { title:"页面标题" }',
        '  core.tabbar → { items:["首页","分类","订单"], active:"当前页标签" }',
        '  core.list-item → { title:"中文标题", description:"中文描述", arrow:true }',
        '  core.statistic → { title:"指标名", value:"128" }',
        '  core.grid/stack/row/divider/spacer → props 可为空对象 {}',
        '',
        '真实页面与节点清单：',
        '```json',
        JSON.stringify(pagesSummary, null, 2),
        '```',
      ].join('\n'),
      tool: SUBMIT_NODE_CONTENT_TOOL,
      parse: (args) => {
        const items = Array.isArray(args.pages)
          ? args.pages
          : Array.isArray(args.items)
            ? args.items
            : null;
        if (!items || items.length === 0) {
          throw new Error('submit_node_content 必须提供非空 pages 数组');
        }
        return args;
      },
      maxIterations: 6,
    });

    const r = result.output;
    const items = Array.isArray(r.pages)
      ? r.pages
      : Array.isArray(r.items)
        ? r.items
        : [{ pageId: r.pageId, nodes: r.nodes ?? [] }];

    const pages: PageNodeContentFill[] = items.flatMap((entry): PageNodeContentFill[] => {
      const item = asRecord(entry);
      if (!item) {
        return [];
      }
      const pageId = asString(item.pageId);
      if (!pageId) {
        return [];
      }
      const rawNodes = Array.isArray(item.nodes) ? item.nodes : [];
      const nodes = rawNodes.flatMap((nodeEntry) => {
        const n = asRecord(nodeEntry);
        const nodeId = n ? asString(n.nodeId) : undefined;
        if (!n || !nodeId) {
          return [];
        }
        return [{ nodeId, props: asRecord(n.props) ?? {} }];
      });
      return [{ pageId, nodes }];
    });

    return { pages, tokens: result.usage };
  }

  // ─── Phase C: Visual Assets ────────────────────────────────────

  private async phaseAssets(
    provider: AIProvider,
    model: string,
    templateId: string,
    imageNodes: readonly ImageNodeSpec[],
    brief: DesignerOutput,
  ): Promise<AssetsPhaseResult> {
    const result = await runStructuredStage<Record<string, unknown>>({
      provider,
      model,
      systemPrompt: STAGE_SCHEMA_GENERATOR_SYSTEM_PROMPT,
      userMessage: [
        '**Phase C: 生成 Visual Assets**',
        '',
        '为下面列出的每一个 core.image 节点生成一条 visual asset。',
        '每条必须保留对应的 nodeId 与 pageId，id 建议与 nodeId 相同或使用 "{nodeId}-asset"。',
        '',
        '要求：',
        '- hero/banner 图用 provider:"ai-image"，prompt 写 30-50 字英文具体描述',
        '- 卡片封面图用 provider:"ai-image"',
        '- 图标类用 provider:"placeholder"',
        '- 人物/头像 prompt 默认写 "East Asian young person/people"',
        '- alt 使用简体中文',
        '',
        JSON.stringify(
          {
            templateId,
            name: brief.name,
            displayCategory: brief.displayCategory,
            imageNodes,
          },
          null,
          2,
        ),
      ].join('\n'),
      tool: SUBMIT_VISUAL_ASSETS_TOOL,
      parse: (args) => {
        if (!Array.isArray(args.visualAssets)) {
          throw new Error('visualAssets 必须是数组');
        }
        return args;
      },
      maxIterations: 3,
    });

    const rawAssets = Array.isArray(result.output.visualAssets)
      ? result.output.visualAssets.filter(
          (item): item is Record<string, unknown> => asRecord(item) !== null,
        )
      : [];

    return {
      assets: rawAssets,
      tokens: result.usage,
    };
  }

  // ─── Tree Build & Content Application ──────────────────────────

  private buildSkeletonTrees(
    pages: readonly PageSkeleton[],
    brief: DesignerOutput,
  ): BuiltPageSkeleton[] {
    const seenIds = new Set<string>();
    return pages.map((page) => {
      const aliasCounters = new Map<string, number>();
      const collectedNodes: SkeletonNodeSpec[] = [];
      const layout = this.buildLayoutTree(
        page.containerTree,
        page.id,
        page.name,
        brief,
        aliasCounters,
        seenIds,
        collectedNodes,
      );
      return {
        id: page.id,
        name: page.name,
        kind: page.kind,
        layout,
        nodes: collectedNodes,
      };
    });
  }

  private applyContentFills(
    builtPages: readonly BuiltPageSkeleton[],
    fills: readonly PageNodeContentFill[],
    brief: DesignerOutput,
  ): void {
    const tabLabels = this.resolveBottomTabLabels(builtPages, brief);
    const labelToPageId = new Map<string, string>();
    builtPages.forEach((page, index) => {
      const briefTab = brief.bottomTabs.at(index);
      const label = asString(briefTab?.label) ?? page.name;
      const targetId =
        briefTab && builtPages.some((p) => p.id === briefTab.targetPageId)
          ? briefTab.targetPageId
          : page.id;
      labelToPageId.set(label, targetId);
    });

    for (const page of builtPages) {
      const fill = fills.find((f) => f.pageId === page.id);
      const fillById = new Map((fill?.nodes ?? []).map((n) => [n.nodeId, n.props]));
      const pageTabLabel = labelToPageId.size
        ? ([...labelToPageId.entries()].find(([, targetId]) => targetId === page.id)?.[0] ??
          page.name)
        : page.name;

      const patchNode = (node: ThemeLayoutNode): void => {
        const nodeFill = fillById.get(node.id);
        if (nodeFill) {
          node.props = { ...(node.props ?? {}), ...nodeFill };
        }
        this.applyStructuralNodeDefaults(node, page, tabLabels, pageTabLabel, labelToPageId);
        node.children?.forEach(patchNode);
      };

      patchNode(page.layout);
    }
  }

  private applyStructuralNodeDefaults(
    node: ThemeLayoutNode,
    page: BuiltPageSkeleton,
    tabLabels: readonly string[],
    pageTabLabel: string,
    labelToPageId: ReadonlyMap<string, string>,
  ): void {
    node.props = node.props ?? {};

    if (node.alias === 'core.screen') {
      if (!asString(node.props.title)) {
        node.props.title = page.name;
      }
      return;
    }

    if (node.alias === 'core.navbar' && !asString(node.props.title)) {
      node.props.title = page.name;
      return;
    }

    if (node.alias === 'core.image' && !asString(node.props.alt)) {
      node.props.alt = `${page.name}配图`;
      return;
    }

    if (node.alias === 'core.tabs') {
      const existingTabs = Array.isArray(node.props.tabs)
        ? node.props.tabs.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        : [];
      const effectiveTabs = existingTabs.length > 0 ? existingTabs : [...tabLabels];
      node.props.tabs = effectiveTabs;
      if (!asString(node.props.activeTab)) {
        node.props.activeTab = effectiveTabs.includes(pageTabLabel)
          ? pageTabLabel
          : (effectiveTabs[0] ?? page.name);
      }

      if (node.slot === 'footer' && effectiveTabs.length > 0) {
        const onTabClick: Record<string, { type: 'navigate'; targetPageId: string }> = {};
        for (const label of effectiveTabs) {
          const targetPageId = labelToPageId.get(label);
          if (targetPageId) {
            onTabClick[label] = { type: 'navigate', targetPageId };
          }
        }
        if (Object.keys(onTabClick).length > 0) {
          node.interactions = { ...(node.interactions ?? {}), onTabClick };
        }
      }
    }
  }

  private resolveBottomTabLabels(
    builtPages: readonly BuiltPageSkeleton[],
    brief: DesignerOutput,
  ): string[] {
    if (brief.bottomTabs.length > 0) {
      return brief.bottomTabs.map((tab) => tab.label.trim()).filter((label) => label.length > 0);
    }
    return builtPages.map((page) => page.name);
  }

  private collectImageNodes(builtPages: readonly BuiltPageSkeleton[]): ImageNodeSpec[] {
    const images: ImageNodeSpec[] = [];
    const visit = (node: ThemeLayoutNode, pageId: string): void => {
      if (node.alias === 'core.image') {
        const alt = asString(node.props?.alt);
        images.push({ nodeId: node.id, pageId, ...(alt ? { alt } : {}) });
      }
      node.children?.forEach((child) => visit(child, pageId));
    };
    builtPages.forEach((page) => visit(page.layout, page.id));
    return images;
  }

  // ─── Assembly: 合并为完整文档 ──────────────────────────────────

  private assembleDocument(
    skeleton: SkeletonPhaseResult,
    builtPages: readonly BuiltPageSkeleton[],
    rawAssets: readonly Record<string, unknown>[],
    brief: DesignerOutput,
  ): ThemeLayoutDocument {
    const pages = builtPages.map((page) => ({
      id: page.id,
      name: page.name,
      layout: page.layout,
    }));

    const mergedCssVars = {
      ...brief.cssVars,
      ...skeleton.cssVars,
    };

    const usedAliases = new Set<string>();
    const collectAliases = (node: ThemeLayoutNode): void => {
      usedAliases.add(node.alias);
      node.children?.forEach(collectAliases);
    };
    pages.forEach((p) => collectAliases(p.layout));

    const bizAliases = new Set<string>([
      ...skeleton.componentTemplateAliases.filter((a) => !a.startsWith('core.')),
      ...[...usedAliases].filter((a) => !a.startsWith('core.')),
    ]);

    const componentTemplates: Record<string, unknown> = {};
    for (const alias of bizAliases) {
      const draft = brief.componentTemplatesDraft.find(
        (d) => d.alias === alias || `biz-${d.alias}` === alias,
      );
      const displayName = draft?.description ?? alias.replace(/^biz-/, '').replace(/-/g, ' ');
      componentTemplates[alias] = {
        displayName,
        root: {
          id: `${alias}-root`,
          alias: 'core.panel',
          layout: { mode: 'flow', width: '100%' },
          props: { tone: 'default' },
          children: [
            {
              id: `${alias}-stack`,
              alias: 'core.stack',
              layout: { mode: 'flow', width: '100%' },
              props: { gap: '8px' },
              children: [
                {
                  id: `${alias}-title`,
                  alias: 'core.text',
                  layout: { mode: 'flow' },
                  props: { text: { $bind: 'title' }, variant: 'heading' },
                },
                {
                  id: `${alias}-row`,
                  alias: 'core.row',
                  layout: { mode: 'flow', width: '100%' },
                  props: { justify: 'space-between', align: 'center' },
                  children: [
                    {
                      id: `${alias}-tag`,
                      alias: 'core.tag',
                      layout: { mode: 'flow' },
                      props: { label: { $bind: 'tag' }, tone: 'info' },
                    },
                    {
                      id: `${alias}-action`,
                      alias: 'core.button',
                      layout: { mode: 'flow' },
                      props: { label: { $bind: 'actionLabel' }, variant: 'primary' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      };
    }

    const customComponents = [...bizAliases].map((alias) => ({
      alias,
      name: alias,
      kind: 'layout' as const,
      description: '',
      props: [],
    }));

    const normalizedAssets = normalizeVisualAssets(rawAssets);
    const rawDocument: Record<string, unknown> = {
      version: 1,
      themeId: skeleton.templateId,
      themeName: brief.name,
      description: brief.tagline,
      components: [...CORE_COMPONENTS, ...customComponents],
      pages,
      defaultPageId: pages[0]?.id ?? '',
      layout: pages[0]?.layout ?? null,
      componentTemplates,
      visualAssets: normalizedAssets,
      cssVars: mergedCssVars,
      style: { cssVars: mergedCssVars },
    };

    const withAssets =
      normalizedAssets.length > 0
        ? applyVisualAssetsToLayoutDocument(rawDocument, normalizedAssets)
        : rawDocument;

    let document = migrateThemeLayoutDocument(withAssets);
    const firstPageAlias = document.pages[0]?.layout.alias ?? '';
    this.logger.debug(`post-migrate: pages[0].layout.alias=${firstPageAlias}`);

    const pagesArr = document.pages;
    const defaultPage = pagesArr.find((p) => p.id === document.defaultPageId) ?? pagesArr[0];
    document = { ...document, layout: defaultPage.layout, defaultPageId: defaultPage.id };

    const preFixResult = preValidateAndFix(
      document as unknown as Record<string, unknown>,
      componentTemplates,
    );
    document = preFixResult.document as unknown as ThemeLayoutDocument;

    const check = validateGeneratedTemplateLayout(document, document.componentTemplates);
    if (!check.valid) {
      const errMessages = check.errors
        .slice(0, 5)
        .map((e) => `[${e.code}] ${e.path}: ${e.message}`)
        .join('; ');
      throw new Error(`文档校验失败: ${errMessages}`);
    }

    return document;
  }

  /** 修正 alias：映射非法别名到合法别名，纯数字/不可识别则跳过 */
  private normalizeAlias(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed || /^\d+$/.test(trimmed)) {
      return null;
    }
    const withoutPrefix = trimmed.startsWith('core.') ? trimmed.slice(5) : trimmed;
    if (
      LEAF_NODE_ALIASES.has(withoutPrefix) ||
      CONTAINER_ALIASES.has(withoutPrefix) ||
      trimmed.startsWith('biz-')
    ) {
      return trimmed.startsWith('biz-') ? trimmed : withoutPrefix;
    }
    return ALIAS_FIXUP[withoutPrefix] ?? null;
  }

  private nextUniqueNodeId(
    pageId: string,
    normalizedAlias: string,
    aliasCounters: Map<string, number>,
    seenIds: Set<string>,
  ): string {
    const nextCount = (aliasCounters.get(normalizedAlias) ?? 0) + 1;
    aliasCounters.set(normalizedAlias, nextCount);
    let candidate = `${pageId}-${normalizedAlias}-${nextCount}`;
    let suffix = nextCount;
    while (seenIds.has(candidate)) {
      suffix += 1;
      candidate = `${pageId}-${normalizedAlias}-${suffix}`;
    }
    seenIds.add(candidate);
    return candidate;
  }

  private buildLayoutTree(
    treeStr: string,
    pageId: string,
    pageName: string,
    brief: DesignerOutput,
    aliasCounters: Map<string, number>,
    seenIds: Set<string>,
    collectedNodes: SkeletonNodeSpec[],
  ): ThemeLayoutNode {
    const trimmed = treeStr.trim();
    const arrowIdx = trimmed.indexOf('>');
    const rootAliasRaw = arrowIdx > 0 ? trimmed.slice(0, arrowIdx).trim() : trimmed;
    const parsedRootAlias = this.normalizeAlias(rootAliasRaw);
    const rootAlias =
      parsedRootAlias && CONTAINER_ALIASES.has(parsedRootAlias) ? parsedRootAlias : 'screen';
    const childrenStr = arrowIdx > 0 ? trimmed.slice(arrowIdx + 1).trim() : '';

    this.logger.debug(`buildLayoutTree: page=${pageId} root=${rootAlias} (raw=${rootAliasRaw})`);

    let rootId = `${pageId}-${rootAlias}`;
    while (seenIds.has(rootId)) {
      rootId = `${rootId}-2`;
    }
    seenIds.add(rootId);

    const rootNode: ThemeLayoutNode = {
      id: rootId,
      alias: `core.${rootAlias}`,
      layout: { mode: 'flow', width: '100%' },
      props: {
        title: pageName,
        surface: brief.platform,
        chrome: brief.chrome,
      },
      children: [],
    };
    collectedNodes.push({ nodeId: rootId, alias: rootNode.alias });

    rootNode.children = this.parseChildren(
      childrenStr,
      pageId,
      rootId,
      1,
      aliasCounters,
      seenIds,
      collectedNodes,
    );

    return rootNode;
  }

  private parseChildren(
    str: string,
    pageId: string,
    parentId: string,
    depth: number,
    aliasCounters: Map<string, number>,
    seenIds: Set<string>,
    collectedNodes: SkeletonNodeSpec[],
  ): ThemeLayoutNode[] {
    if (!str) {
      return [];
    }
    const children: ThemeLayoutNode[] = [];
    let idx = 0;
    let order = 0;

    while (idx < str.length && children.length < 20) {
      const nextComma = this.findCommaOrEnd(str, idx);
      const segment = str.slice(idx, nextComma).trim();
      idx = nextComma + 1;
      if (!segment) {
        continue;
      }

      const openParen = segment.indexOf('(');
      const alias = (openParen > 0 ? segment.slice(0, openParen) : segment).trim();
      const closeParen = segment.lastIndexOf(')');
      const innerStr =
        openParen > 0 && closeParen > openParen ? segment.slice(openParen + 1, closeParen) : '';

      const normalizedAlias = this.normalizeAlias(alias);
      if (!normalizedAlias) {
        continue;
      }

      order += 1;
      const nodeId = this.nextUniqueNodeId(pageId, normalizedAlias, aliasCounters, seenIds);
      const effectiveAlias = normalizedAlias.startsWith('biz-')
        ? normalizedAlias
        : `core.${normalizedAlias}`;
      const isFooterTabs =
        depth === 1 && (effectiveAlias === 'core.tabs' || effectiveAlias === 'core.tabbar');

      const child: ThemeLayoutNode = {
        id: nodeId,
        alias: effectiveAlias,
        ...(isFooterTabs ? { slot: 'footer' as const } : {}),
        layout: { mode: 'flow', order },
        props: {},
      };
      collectedNodes.push({
        nodeId,
        alias: effectiveAlias,
        parentId,
        ...(isFooterTabs ? { slot: 'footer' as const } : {}),
      });

      // Only core container aliases may contain children on the instance tree.
      // biz-* nodes expand via componentTemplates and must not carry instance children.
      const canHaveChildren =
        !normalizedAlias.startsWith('biz-') && CONTAINER_ALIASES.has(normalizedAlias);

      if (innerStr && canHaveChildren) {
        child.children = this.parseChildren(
          innerStr,
          pageId,
          nodeId,
          depth + 1,
          aliasCounters,
          seenIds,
          collectedNodes,
        );
      }

      children.push(child);
    }

    return children;
  }

  private findCommaOrEnd(str: string, start: number): number {
    let depth = 0;
    for (let i = start; i < str.length; i++) {
      if (str[i] === '(') {
        depth++;
      } else if (str[i] === ')') {
        depth = Math.max(0, depth - 1);
      } else if (str[i] === ',' && depth === 0) {
        return i;
      }
    }
    return str.length;
  }
}
