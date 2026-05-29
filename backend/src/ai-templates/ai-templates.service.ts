import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  TEMPLATE_READ_REPOSITORY,
  type TemplateDiversitySummaryRecord,
  type TemplateReadRepository,
} from '../templates/repositories/template-read.repository';
import { TemplateAssetService } from '../templates/template-asset.service';
import { TemplatePipelineService } from './orchestrator/pipeline.service';
import type {
  ExistingTemplateSummary,
  HeroMode,
  PipelineExternalResult,
  PipelineResult,
  TemplateArchetype,
  TemplateSeed,
} from './orchestrator/pipeline.types';

export interface GenerateOptions {
  /**
   * 是否真实生成图片（调 OpenAI Images API，按张计费 ~$0.04）。
   * 默认 false（visualAssets 保留 provider="ai-image" 但不 materialize），
   * 用户启动后端时 onModuleInit import 会再触发一次生成。
   */
  materializeImages?: boolean;
}

const ARCHETYPE_TRAIT_PREFIX = 'archetype:';
const HERO_TRAIT_PREFIX = 'hero:';
const SIGNATURE_TRAIT_PREFIX = 'sig:';

const VALID_ARCHETYPES: readonly TemplateArchetype[] = [
  'fresh',
  'immersive',
  'editorial',
  'vibrant',
  'dark-pro',
];
const VALID_HERO_MODES: readonly HeroMode[] = [
  'date-strip',
  'function-grid',
  'cover-story',
  'metric-dashboard',
  'story-ring',
  'dual-column',
  'timer-banner',
  'search-filter',
];

/**
 * AI Templates Service
 *
 * 对外业务层。负责：
 *  - 收集"已有模板摘要"作为 Diversity Critic 的输入
 *  - 调用 Pipeline 跑 4-stage 流水线
 *  - Round 2 起：把生成结果持久化到 Template 表
 *
 * 当前 Round 1：只做流水线调用 + summary 提取，不做持久化。
 */
@Injectable()
export class AiTemplatesService {
  private readonly logger = new Logger(AiTemplatesService.name);

  constructor(
    @Inject(TEMPLATE_READ_REPOSITORY)
    private readonly templates: TemplateReadRepository,
    private readonly pipeline: TemplatePipelineService,
    private readonly templateAssetService: TemplateAssetService,
  ) {}

  /**
   * 生成模板并返回精简的对外结果（不含 stages / totalAttempts 等内部诊断字段）。
   * HTTP 控制器用这个版本，避免把逐 stage 的 token 记录暴露给前端。
   */
  async generate(
    seed: TemplateSeed,
    options: GenerateOptions = {},
  ): Promise<PipelineExternalResult> {
    const result = await this.generateDetailed(seed, options);
    return {
      templateId: result.templateId,
      document: result.document,
      brief: result.brief,
      totalDurationMs: result.totalDurationMs,
    };
  }

  /**
   * 生成模板并返回完整的 PipelineResult（含 stages / totalAttempts）。
   * 批量 CLI / 脚本需要逐 stage 的 token 统计，直接调用本方法。
   */
  async generateDetailed(
    seed: TemplateSeed,
    options: GenerateOptions = {},
  ): Promise<PipelineResult> {
    const existing = await this.collectExistingSummaries(seed);
    this.logger.log(
      `generating template "${seed.prompt}" with ${existing.length} existing baselines`,
    );
    const result = await this.pipeline.generate(seed, existing);
    const document = await this.maybeMaterializeImages(result.templateId, result.document, options);
    return { ...result, document };
  }

  /**
   * 当 options.materializeImages 为真时，调 TemplateAssetService 把 ai-image
   * visualAssets 实际生成为图片并落盘到
   * /template-assets/generated/<templateId>/<assetId>.png，
   * 同时把生成的 url 写回 visualAssets 和 layoutDocument 中 core.image 节点的 src。
   * 否则原样返回 document。
   */
  private async maybeMaterializeImages(
    templateId: string,
    document: PipelineResult['document'],
    options: GenerateOptions,
  ): Promise<PipelineResult['document']> {
    if (!options.materializeImages) {
      return document;
    }

    const visualAssetsRaw = (document as unknown as { visualAssets?: unknown }).visualAssets;
    if (!Array.isArray(visualAssetsRaw) || visualAssetsRaw.length === 0) {
      this.logger.warn(`${templateId}: 模板没有 visualAssets，跳过图片生成`);
      return document;
    }

    this.logger.log(`${templateId}: materializing ${visualAssetsRaw.length} visual assets...`);
    const assetResolution = await this.templateAssetService.resolveVisualAssetsForTemplate(
      templateId,
      document as unknown as Record<string, unknown>,
      visualAssetsRaw,
    );

    // applyVisualAssetsToLayoutDocument 只补丁 core.image 节点的 src/alt/iconColor，
    // 不更新 document.visualAssets 数组里的 status/url。
    // 这里把 resolveVisualAsset 返回的 (已生成 url、status=generated 的) 资产
    // 写回到 document.visualAssets，让渲染器和后续 onModuleInit 都能直接用。
    let mergedDocument: Record<string, unknown> = {
      ...assetResolution.layoutDocument,
      visualAssets: assetResolution.visualAssets,
    };

    // 重写 componentTemplate 中的 image $bind：renderer 的 ImageNode 只读 props.src，
    // 不会从 assetId 查 visualAssets。把 `assetId: { $bind: K }` 改成 `src: { $bind: K }`
    // 同时把 biz-* 实例 props 中那个 K 字段对应的 string assetId 替换为真实 URL。
    const assetUrlMap = new Map<string, string>();
    for (const asset of assetResolution.visualAssets) {
      if (asset.url) {
        assetUrlMap.set(asset.id, asset.url);
      }
    }
    if (assetUrlMap.size > 0) {
      mergedDocument = this.rewriteImageBindingsAndInjectUrls(mergedDocument, assetUrlMap);
    }

    return mergedDocument as unknown as PipelineResult['document'];
  }

  /**
   * 把 componentTemplates 中 `core.image.props.assetId: { $bind: K }`
   * 改写为 `core.image.props.src: { $bind: K }`，同时把布局树中所有 biz-* 节点
   * `props[K]` 为 assetId 字符串的值替换成对应的真实 URL。
   *
   * 这样 renderer 端 ImageNode（只读 props.src）就能拿到 URL 渲染图片。
   */
  private rewriteImageBindingsAndInjectUrls(
    document: Record<string, unknown>,
    assetUrlMap: Map<string, string>,
  ): Record<string, unknown> {
    const cloned = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
    const componentTemplates = cloned.componentTemplates as Record<string, unknown> | undefined;
    const rewrittenBindKeys = new Set<string>();

    const isBindObject = (v: unknown): v is { $bind: string } =>
      !!v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      typeof (v as { $bind?: unknown }).$bind === 'string';

    const rewriteTemplateNode = (node: unknown): void => {
      if (!node || typeof node !== 'object') {
        return;
      }
      const n = node as { alias?: unknown; props?: Record<string, unknown>; children?: unknown[] };
      if (n.alias === 'core.image' && n.props) {
        const ai = n.props.assetId;
        if (isBindObject(ai)) {
          rewrittenBindKeys.add(ai.$bind);
          n.props.src = { $bind: ai.$bind };
          delete n.props.assetId;
        }
      }
      (n.children ?? []).forEach(rewriteTemplateNode);
    };

    if (componentTemplates) {
      for (const ct of Object.values(componentTemplates)) {
        const root = (ct as { root?: unknown } | null)?.root;
        if (root) {
          rewriteTemplateNode(root);
        }
      }
    }

    if (rewrittenBindKeys.size === 0) {
      return cloned;
    }

    // 实例 props 中匹配到 rewrittenBindKey 且值是字符串 assetId，替换为 URL
    const injectUrlsInInstance = (node: unknown): void => {
      if (!node || typeof node !== 'object') {
        return;
      }
      const n = node as {
        alias?: unknown;
        props?: Record<string, unknown>;
        children?: unknown[];
      };
      if (n.props && typeof n.alias === 'string' && !n.alias.startsWith('core.')) {
        for (const key of rewrittenBindKeys) {
          const value = n.props[key];
          if (typeof value === 'string') {
            const url = assetUrlMap.get(value);
            if (url) {
              n.props[key] = url;
            }
          }
        }
      }
      (n.children ?? []).forEach(injectUrlsInInstance);
    };

    const pages = cloned.pages as { layout?: unknown }[] | undefined;
    pages?.forEach((page) => {
      if (page.layout) {
        injectUrlsInInstance(page.layout);
      }
    });
    if (cloned.layout) {
      injectUrlsInInstance(cloned.layout);
    }

    return cloned;
  }

  /**
   * 提取已有模板的多样性摘要。
   *
   * archetype / heroMode / diversitySignature 通过 traits 数组中的
   * 前缀化条目持久化（如 "archetype:fresh"、"hero:cover-story"、"sig:..."）。
   * 已有模板没有这些 trait 时，对应字段降级为 "unknown"。
   */
  private async collectExistingSummaries(seed: TemplateSeed): Promise<ExistingTemplateSummary[]> {
    // 仅取公共模板 + 同 displayCategory（如果种子已指定）作为对比基线，
    // 控制 critic prompt 长度。
    const templates = await this.templates.findDiversitySummaries({
      displayCategory: seed.displayCategory,
      limit: 50,
    });

    return templates.map((t) => this.toSummary(t));
  }

  private toSummary(template: TemplateDiversitySummaryRecord): ExistingTemplateSummary {
    const traits = template.traits;
    const archetype = this.extractTrait<TemplateArchetype>(
      traits,
      ARCHETYPE_TRAIT_PREFIX,
      VALID_ARCHETYPES,
      'fresh',
    );
    const heroMode = this.extractTrait<HeroMode>(
      traits,
      HERO_TRAIT_PREFIX,
      VALID_HERO_MODES,
      'function-grid',
    );
    const signature =
      traits
        .find((t) => t.startsWith(SIGNATURE_TRAIT_PREFIX))
        ?.slice(SIGNATURE_TRAIT_PREFIX.length) ?? `legacy-${template.templateId}`;

    const componentTemplateAliases = Object.keys(template.componentTemplates);
    const primaryHue = template.cssVars['--color-primary'] ?? template.accent;

    return {
      templateId: template.templateId,
      name: template.name,
      archetype,
      heroMode,
      displayCategory: template.displayCategory,
      diversitySignature: signature,
      componentTemplateAliases,
      primaryHue,
    };
  }

  private extractTrait<T extends string>(
    traits: string[],
    prefix: string,
    valid: readonly T[],
    fallback: T,
  ): T {
    const found = traits.find((t) => t.startsWith(prefix))?.slice(prefix.length);
    return (valid as readonly string[]).includes(found ?? '') ? (found as T) : fallback;
  }
}
