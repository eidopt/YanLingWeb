import { Inject, Injectable, Logger } from '@nestjs/common';
import { CORE_COMPONENTS, STAGE_SCHEMA_GENERATOR_SYSTEM_PROMPT } from '@shared/agent/runtime';
import { migrateThemeLayoutDocument } from '@shared/theme-layout/migrations';

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
import { runStructuredStage } from '../orchestrator/runStage';
import { autoBizComponents, preValidateAndFix } from './preValidateFix';
import {
  SUBMIT_PAGE_SKELETON_TOOL,
  SUBMIT_NODE_CONTENT_TOOL,
  SUBMIT_VISUAL_ASSETS_TOOL,
} from '../tools/schemaStep.tools';

// 叶子节点 alias — 用于 parser 判断容器 vs 叶子
const LEAF_NODE_ALIASES = new Set([
  'text', 'button', 'image', 'tag', 'progress', 'divider', 'spacer',
  'input', 'tabs', 'search', 'notice', 'widget', 'tabbar', 'statistic', 'avatar', 'badge',
  'breadcrumb', 'pagination', 'empty', 'skeleton', 'select', 'checkbox', 'radio', 'switch',
  'rate', 'slider', 'datepicker', 'timepicker', 'upload', 'toast', 'alert', 'loading',
  'video', 'audio', 'tooltip', 'carousel', 'table',
]);

const CONTAINER_ALIASES = new Set([
  'screen', 'panel', 'stack', 'row', 'grid', 'html',
  'navbar', 'list', 'list-item', 'dialog', 'drawer',
  'collapse', 'sidebar', 'form', 'toolbar', 'splitter', 'timeline', 'tree',
]);

/** LLM 常编造的非法 alias → 映射为合法 alias */
const ALIAS_FIXUP: Record<string, string> = {
  'title': 'text', 'desc': 'text', 'description': 'text', 'content': 'text',
  'subtitle': 'text', 'name': 'text', 'label': 'tag',
  'header': 'navbar', 'footer': 'tabs', 'foot': 'tabs', 'bottom-nav': 'tabs',
  'card': 'panel', 'cards': 'panel', 'product-card': 'panel', 'item-card': 'panel',
  'menu': 'list', 'menus': 'list', 'food-card': 'panel', 'food-cards': 'grid',
  'category-card': 'panel', 'category-cards': 'grid', 'categories': 'row',
  'banner': 'image', 'hero': 'image', 'avatar-image': 'image',
  'search-bar': 'search', 'input-box': 'input', 'text-input': 'input',
  'cta': 'button', 'primary-button': 'button', 'action-button': 'button',
  'icon-grid': 'grid', 'function-grid': 'grid', 'grid-menu': 'grid',
  'status': 'tag', 'badge-tag': 'tag', 'price-tag': 'tag',
  'rating': 'statistic', 'progress-bar': 'progress', 'stats': 'statistic',
  'divider-line': 'divider', 'spacing': 'spacer', 'empty-state': 'empty',
  'loading-state': 'loading', 'tab-navigation': 'tabs', 'bottom-tabs': 'tabs',
  'carousel-slider': 'carousel', 'image-slider': 'carousel',
  'form-input': 'input', 'date-input': 'datepicker', 'time-input': 'timepicker',
  'file-upload': 'upload', 'select-dropdown': 'select',
  'switch-toggle': 'switch', 'checkbox-input': 'checkbox', 'radio-group': 'radio',
  'toast-notification': 'toast', 'alert-message': 'alert',
  'tooltip-hint': 'tooltip', 'video-player': 'video', 'audio-player': 'audio',
};

interface PageSkeleton {
  id: string;
  name: string;
  kind: string;
  /** 容器层级描述：如 "screen>search,panel(text,button),tabs" */
  containerTree: string;
}

interface NodeContentFill {
  pageId: string;
  nodes: { nodeId: string; alias: string; props: Record<string, unknown>; children?: Record<string, unknown>[] }[];
}

/**
 * Stage 3 — Schema Generator (三阶段生成)
 *
 * Phase A: 生成页面骨架（容器层级文本描述，LLM 输出极小）
 * Phase B: 为每个页面填充节点 props
 * Phase C: 生成 visual assets
 * Assembly: 程序化组装完整的 ThemeLayoutDocument 并校验
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
    if (!apiKeyConfigured) throw new Error('AI_API_KEY 未配置');

    this.logger.debug(`schema generator attempt=${attempt} brief=${brief.templateId}`);

    // Phase A: 生成页面骨架
    const skeleton = await this.phaseSkeleton(provider, model, brief);
    this.logger.debug(`phaseA: ${skeleton.pages.length} pages, ${skeleton.templateId}`);

    // Phase B: 填充所有页面内容
    const contentFill = await this.phaseContent(provider, model, skeleton, brief);
    this.logger.debug(`phaseB: ${contentFill.length} pages filled`);

    // Phase C: 生成 visual assets
    const assets = await this.phaseAssets(provider, model, skeleton, contentFill, brief);
    this.logger.debug(`phaseC: ${assets.assets.length} visual assets`);

    // Assembly: 合并为完整文档
    const document = this.assembleDocument(skeleton, contentFill, assets, brief);

    const totalTokens = skeleton.tokens + contentFill.reduce((s, c) => s + c.tokens, 0) + assets.tokens;
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
    provider: any, model: string, brief: DesignerOutput,
  ): Promise<{ templateId: string; pages: PageSkeleton[]; componentTemplateAliases: string[]; cssVars: Record<string, string>; tokens: any }> {
    const result = await runStructuredStage<Record<string, unknown>>({
      provider, model,
      systemPrompt: STAGE_SCHEMA_GENERATOR_SYSTEM_PROMPT,
      userMessage: [
          '**Phase A: 生成页面骨架（3-5 页）**',
          '',
          '基于 brief 输出 3-5 个页面的容器层级。每页用 layoutTree 字符串描述。',
          '',
          '格式：screen>子节点1,子节点2(子节点2的子级)',
          '示例：screen>navbar,search,panel(text,button),grid(card,card,card,card),tabs',
          '',
          '约束：',
          '- 必须 3-5 个页面',
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
      parse: (args) => args,
      maxIterations: 4,
    });

    const r = result.output;
    return {
      templateId: r.templateId as string,
      pages: (r.pages as any[])?.map((p: any) => ({
        id: p.id as string,
        name: p.name as string,
        kind: p.kind as string,
        containerTree: p.layoutTree as string,
      })) ?? [],
      componentTemplateAliases: (r.componentTemplateAliases as string[]) ?? [],
      cssVars: (r.cssVars as Record<string, string>) ?? {},
      tokens: result.usage,
    };
  }

  // ─── Phase B: 内容填充（一次性填充所有页面） ─────────────────

  private async phaseContent(
    provider: any, model: string,
    skeleton: { pages: PageSkeleton[]; componentTemplateAliases: string[] },
    brief: DesignerOutput,
  ): Promise<{ pageId: string; nodes: { nodeId: string; props: Record<string, unknown> }[]; tokens: any }[]> {
    // 收集所有页面的容器树信息
    const pagesSummary = skeleton.pages.map(p => ({
      pageId: p.id, name: p.name, containerTree: p.containerTree,
    }));

    const result = await runStructuredStage<Record<string, unknown>>({
      provider, model,
      systemPrompt: STAGE_SCHEMA_GENERATOR_SYSTEM_PROMPT,
      userMessage: [
        '**Phase B: 一次性填充所有页面内容**',
        '',
        `模板有 ${skeleton.pages.length} 个页面。为所有页面的每个节点填充 props。`,
        '',
        '输出格式：为每个页面输出 { pageId, nodes[] }，其中每个 node 含 { nodeId, alias, props }。',
        '',
        '节点 ID 规则：{pageId}-{alias}-{序号}。必须覆盖容器树中每一个节点，不能跳过。',
        '',
        'Props 要求（按 alias 类型）：',
        '  text → { text:"中文文案", variant:"heading/body/caption/title/subtitle" }',
        '  button → { label:"中文按钮名", variant:"primary/secondary" }',
        '  search → { placeholder:"中文搜索提示" }',
        '  image → { alt:"中文描述" }',
        '  tag → { label:"中文标签", tone:"deal/hot/new/success" }',
        '  tabs → { tabs:["首页","分类","订单"], activeTab:"首页" }',
        '  panel → { title:"中文标题", tone:"default/accent" }',
        '  progress → { value:50, max:100, tone:"success" }',
        '  input → { placeholder:"占位文字", label:"字段名" }',
        '  notice → { text:"中文通知", tone:"info/warning" }',
        '  navbar → { title:"页面标题" }',
        '  tabbar → { items:["首页","分类","订单"], active:"首页" }',
        '  list-item → { title:"中文标题", description:"中文描述", arrow:true }',
        '  statistic → { title:"指标名", value:"数字" }',
        '  grid/stack/row/divider/spacer → props 可为空',
        '',
        '页面信息：',
        '```json',
        JSON.stringify(pagesSummary, null, 2),
        '```',
      ].join('\n'),
      tool: SUBMIT_NODE_CONTENT_TOOL,
      parse: (args) => args,
      maxIterations: 6,
    });

    const r = result.output;
    // 支持单页面和多页面两种返回格式
    const items = r.pages ? (r.pages as any[]) : (r.items as any[]) ?? [{ pageId: r.pageId, nodes: r.nodes ?? [] }];
    return items.map((item: any) => ({
      pageId: item.pageId as string,
      nodes: ((item.nodes as any[]) ?? []).map((n: any) => ({
        nodeId: n.nodeId as string,
        props: (n.props as Record<string, unknown>) ?? {},
      })),
      tokens: result.usage,
    }));
  }

  // ─── Phase C: Visual Assets ────────────────────────────────────

  private async phaseAssets(
    provider: any, model: string,
    skeleton: { templateId: string; pages: PageSkeleton[] },
    content: { pageId: string; nodes: { nodeId: string; props: Record<string, unknown> }[] }[],
    brief: DesignerOutput,
  ): Promise<{ assets: any[]; tokens: any }> {
    // 收集所有页面和节点信息供 LLM 参考
    const pageSummary = content.map(c => ({
      pageId: c.pageId,
      nodeCount: c.nodes.length,
      nodeIds: c.nodes.map(n => n.nodeId),
    }));

    const result = await runStructuredStage<Record<string, unknown>>({
      provider, model,
      systemPrompt: STAGE_SCHEMA_GENERATOR_SYSTEM_PROMPT,
      userMessage: [
        '**Phase C: 生成 Visual Assets**',
        '',
        '为模板中的所有 core.image 节点生成 visual assets。',
        '每个 image 节点需要一个对应的 visual asset（id 格式 "{pageId}-{alias}-{序号}"）。',
        '注意不要漏掉任何 image 节点。',
        '',
        '要求：',
        '- hero/banner 图用 provider:"ai-image"，prompt 写 30-50 字英文具体描述',
        '- 卡片封面图用 provider:"ai-image"',
        '- 图标类用 provider:"placeholder" + iconColor 引用 cssVars 主色',
        '- 人物/头像 prompt 默认写 "East Asian young person/people"',
        '',
        JSON.stringify({ templateId: skeleton.templateId, displayCategory: brief.displayCategory, pages: pageSummary }, null, 2),
      ].join('\n'),
      tool: SUBMIT_VISUAL_ASSETS_TOOL,
      parse: (args) => args,
      maxIterations: 3,
    });

    return {
      assets: (result.output.visualAssets as any[]) ?? [],
      tokens: result.usage,
    };
  }

  // ─── Assembly: 合并为完整文档 ──────────────────────────────────

  private assembleDocument(
    skeleton: { templateId: string; pages: PageSkeleton[]; componentTemplateAliases: string[]; cssVars: Record<string, string> },
    contentFills: { pageId: string; nodes: { nodeId: string; props: Record<string, unknown> }[] }[],
    assets: { assets: any[] },
    brief: DesignerOutput,
  ): any {
    const pages = skeleton.pages.map((page, pi) => {
      const fill = contentFills.find(c => c.pageId === page.id);
      const layout = this.buildLayoutTree(page.containerTree, page.id, fill?.nodes ?? []);
      return { id: page.id, name: page.name, layout };
    });

    const componentTemplates: Record<string, any> = {};
    for (const alias of skeleton.componentTemplateAliases) {
      componentTemplates[alias] = {
        displayName: alias.replace('biz-', '').replace(/-/g, ' '),
        root: { id: `${alias}-root`, alias: 'core.panel', layout: { mode: 'flow', width: '100%' }, props: {}, children: [] },
      };
    }

    const doc = {
      version: 1,
      themeId: skeleton.templateId,
      themeName: brief.name,
      description: brief.tagline,
      components: [],
      pages,
      defaultPageId: pages[0]?.id ?? '',
      layout: pages[0]?.layout ?? null,
      componentTemplates,
      visualAssets: assets.assets,
      cssVars: skeleton.cssVars,
      style: { cssVars: skeleton.cssVars },
    };

    const aliases = [...new Set(this.collectAliases(doc))];
    const customAliases = aliases.filter(a => !a.startsWith('core.'));
    const customComponents = skeleton.componentTemplateAliases.map(a => ({
      alias: a, name: a, kind: 'custom' as const, description: '', props: [],
    }));

    const merged = {
      ...doc,
      components: [...CORE_COMPONENTS, ...customComponents],
      componentTemplates,
    };

    let document = migrateThemeLayoutDocument(merged as any);
    this.logger.debug(`post-migrate: pages[0].layout.alias=${document.pages?.[0]?.layout?.alias}`);

    // Align defaultPageId layout
    const pagesArr = Array.isArray(document.pages) ? document.pages : [];
    const defaultPage = pagesArr.find(p => p.id === document.defaultPageId) ?? pagesArr[0];
    if (defaultPage) {
      document = { ...document, layout: defaultPage.layout, defaultPageId: defaultPage.id };
    }

    const preFixResult = preValidateAndFix(
      document as unknown as Record<string, unknown>,
      componentTemplates,
    );
    document = preFixResult.document as unknown as typeof document;

    const check = validateGeneratedTemplateLayout(document, document.componentTemplates);
    if (!check.valid) {
      const errMessages = check.errors.slice(0, 5)
        .map((e: any) => `[${e.code}] ${e.path}: ${e.message}`).join('; ');
      throw new Error(`文档校验失败: ${errMessages}`);
    }

    return document;
  }

  /** 修正 alias：映射非法别名到合法别名，纯数字/不可识别则标记为 spacer */
  private normalizeAlias(raw: string): string | null {
    const alias = raw.trim();
    if (!alias || /^\d+$/.test(alias)) return null; // 纯数字 → 跳过
    if (LEAF_NODE_ALIASES.has(alias) || CONTAINER_ALIASES.has(alias) || alias.startsWith('biz-')) return alias;
    const fixed = ALIAS_FIXUP[alias];
    if (fixed) return fixed;
    // 不认识但可能是容器名 → 当 panel 处理
    return null;
  }

  private buildLayoutTree(
    treeStr: string, pageId: string, fills: { nodeId: string; props: Record<string, unknown> }[],
  ): any {
    const trimmed = treeStr.trim();
    const colonIdx = trimmed.indexOf('>');
    const rootAliasRaw = colonIdx > 0 ? trimmed.slice(0, colonIdx).trim() : trimmed.trim();
    const rootAlias = this.normalizeAlias(rootAliasRaw) ?? 'screen';
    const childrenStr = colonIdx > 0 ? trimmed.slice(colonIdx + 1).trim() : '';

    this.logger.debug(`buildLayoutTree: page=${pageId} root=${rootAlias} (raw=${rootAliasRaw})`);

    const rootAliasFull = rootAlias.startsWith('biz-') ? rootAlias
      : rootAlias.startsWith('core.') ? rootAlias
      : `core.${rootAlias}`;

    const rootNode: any = {
      id: `${pageId}-${rootAlias}`,
      alias: rootAliasFull,
      layout: { mode: 'flow', width: '100%' },
      props: {},
    };

    const isContainer = (alias: string) => alias.startsWith('biz-') || !LEAF_NODE_ALIASES.has(alias);

    if (isContainer(rootAlias)) {
      rootNode.children = this.parseChildren(childrenStr, pageId, fills, 1);
    }

    // Apply fills
    const applyFill = (node: any) => {
      const fill = fills.find(f => f.nodeId === node.id);
      if (fill) node.props = { ...node.props, ...fill.props };
      node.children?.forEach(applyFill);
    };
    applyFill(rootNode);

    return rootNode;
  }

  private parseChildren(
    str: string, pageId: string, fills: { nodeId: string; props: Record<string, unknown> }[], depth: number,
  ): any[] {
    if (!str) return [];
    const children: any[] = [];
    let idx = 0;
    let count = 0;

    while (idx < str.length && count < 20) {
      const nextComma = this.findCommaOrEnd(str, idx);
      let segment = str.slice(idx, nextComma).trim();
      idx = nextComma + 1;
      if (!segment) continue;

      count++;

      // Check if this segment has children: alias(child1,child2)
      const openParen = segment.indexOf('(');
      const alias = (openParen > 0 ? segment.slice(0, openParen) : segment).trim();
      const innerStr = openParen > 0 ? segment.slice(openParen + 1, segment.lastIndexOf(')')) : '';

      // 别名归一化：非法/数字节点跳过
      const normalizedAlias = this.normalizeAlias(alias);
      if (!normalizedAlias) continue;

      const nodeId = `${pageId}-${normalizedAlias}-${count}`;
      const effectiveAlias = normalizedAlias.startsWith('biz-') ? normalizedAlias
        : normalizedAlias.startsWith('core.') ? normalizedAlias
        : `core.${normalizedAlias}`;
      const child: any = {
        id: nodeId,
        alias: effectiveAlias,
        layout: { mode: 'flow', order: count },
        props: {},
      };

      const isContainerFlag = normalizedAlias.startsWith('biz-') || !LEAF_NODE_ALIASES.has(normalizedAlias);

      if (innerStr && isContainerFlag) {
        child.children = this.parseChildren(innerStr, pageId, fills, depth + 1);
      }

      children.push(child);
    }

    return children;
  }

  private findCommaOrEnd(str: string, start: number): number {
    let depth = 0;
    for (let i = start; i < str.length; i++) {
      if (str[i] === '(') depth++;
      else if (str[i] === ')') depth--;
      else if (str[i] === ',' && depth === 0) return i;
    }
    return str.length;
  }

  private collectAliases(doc: any): string[] {
    const aliases = new Set<string>();
    const walk = (node: any) => {
      if (node?.alias) aliases.add(node.alias);
      (node?.children ?? []).forEach(walk);
    };
    (doc.pages ?? []).forEach((p: any) => walk(p.layout));
    return [...aliases];
  }
}
