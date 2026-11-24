import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  applyVisualAssetsToLayoutDocument,
  buildVisualAssetManifest,
  isAllowedTemplateImageSrc,
  normalizeVisualAssets,
  type VisualAsset,
  type VisualAssetManifest,
} from '@shared/theme-layout/visualAssets';

import { GenerationQueue } from '../common/generationQueue';
import { ConfigService } from '../config/config.service';
import { appendAssetSignature } from './assetSignature';
import { generateImageBytes, toImageGenerationConfig } from './imageGeneration';
import {
  type AssetLookupContext,
  TEMPLATE_ASSET_STORE,
  type TemplateAssetStore,
} from './templateAssetStore';

export interface ResolvedTemplateVisualAssets {
  visualAssets: VisualAsset[];
  layoutDocument: Record<string, unknown>;
  manifest: VisualAssetManifest | null;
}

/**
 * 模板图片解析策略：
 *  - `generate`：素材库命中优先（asset.url → 精确缓存 → 语义索引），命不中才调 AI 生图。
 *  - `library`：**只从素材库语义取最接近的现成图**，命不中 → 占位符，**绝不生图**（零成本/秒出）。
 *  - `placeholder`：纯占位符，跳过一切复用与生图。
 */
export type TemplateImageStrategy = 'generate' | 'library' | 'placeholder';

export interface ResolveVisualAssetsOptions {
  /**
   * 图片解析策略，见 {@link TemplateImageStrategy}。
   * 不传时按全局配置 `ai.imageGenerationEnabled && ai.materializeImages` 决定：
   * 全开→`generate`，任一关闭→`placeholder`。
   */
  strategy?: TemplateImageStrategy;
  /** Attach a short-lived signature so private generated images are not world-readable. */
  signUrls?: boolean;
}

interface RolePlaceholder {
  title: string;
  iconColor: string;
}

const ROLE_PLACEHOLDERS: Record<string, RolePlaceholder> = {
  hero: {
    title: 'Hero image',
    iconColor: 'linear-gradient(135deg, #0F766E 0%, #F59E0B 100%)',
  },
  banner: {
    title: 'Banner image',
    iconColor: 'linear-gradient(135deg, #2563EB 0%, #F97316 100%)',
  },
  avatar: {
    title: 'Avatar',
    iconColor: 'linear-gradient(135deg, #7C3AED 0%, #14B8A6 100%)',
  },
  icon: {
    title: 'Icon',
    iconColor: 'linear-gradient(135deg, #475569 0%, #22C55E 100%)',
  },
  default: {
    title: 'Template image',
    iconColor: 'linear-gradient(135deg, #334155 0%, #EAB308 100%)',
  },
};

const ASSET_RESOLVE_CONCURRENCY = 4;

async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  const runners = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(runners);
  return results;
}

@Injectable()
export class TemplateAssetService {
  private readonly logger = new Logger(TemplateAssetService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(TEMPLATE_ASSET_STORE) private readonly store: TemplateAssetStore,
    @Optional() private readonly generationQueue?: GenerationQueue,
  ) {}

  async resolveVisualAssetsForTemplate(
    templateId: string,
    layoutDocument: Record<string, unknown>,
    value: unknown,
    options: ResolveVisualAssetsOptions = {},
  ): Promise<ResolvedTemplateVisualAssets> {
    const visualAssets = normalizeVisualAssets(value);
    if (!visualAssets.length) {
      return { visualAssets: [], layoutDocument, manifest: null };
    }

    // 策略：显式传入优先；未传时：
    // - 生图总开关关闭 → placeholder
    // - materializeImages 开启 → generate（先查缓存与素材库，未命中调 AI 生图）
    // - 其余情况 → library（零成本优先从本地缓存与素材库复用图片，未命中再回退占位符）
    const defaultStrategy: TemplateImageStrategy = !this.config.ai.imageGenerationEnabled
      ? 'placeholder'
      : this.config.ai.materializeImages
        ? 'generate'
        : 'library';
    const strategy: TemplateImageStrategy = options.strategy ?? defaultStrategy;

    const resolvedAssets = await runWithConcurrency(
      visualAssets,
      ASSET_RESOLVE_CONCURRENCY,
      async (asset) => {
        try {
          return await this.resolveVisualAsset(templateId, asset, strategy);
        } catch (error) {
          const reason = `asset resolution failed: ${this.errorMessage(error)}`;
          this.logger.warn(
            `Falling back to placeholder for template asset ${templateId}/${asset.id}: ${reason}`,
          );
          return this.withPlaceholderFallback(asset, reason);
        }
      },
    );

    const signedAssets = options.signUrls
      ? resolvedAssets.map((asset) => this.signAssetUrl(asset))
      : resolvedAssets;
    const resolvedLayoutDocument = applyVisualAssetsToLayoutDocument(layoutDocument, signedAssets);

    return {
      visualAssets: signedAssets,
      layoutDocument: resolvedLayoutDocument,
      manifest: buildVisualAssetManifest(templateId, signedAssets),
    };
  }

  private async resolveVisualAsset(
    templateId: string,
    asset: VisualAsset,
    strategy: TemplateImageStrategy = 'generate',
  ): Promise<VisualAsset> {
    if (asset.url && isAllowedTemplateImageSrc(asset.url)) {
      return {
        ...asset,
        provider:
          asset.provider ?? (asset.url.startsWith('/template-assets/') ? 'curated' : 'manual'),
        status: asset.status ?? 'generated',
      };
    }

    // 纯占位符策略：跳过一切复用与生图，直接占位。
    if (strategy === 'placeholder') {
      return this.withPlaceholderFallback(asset, 'placeholder strategy');
    }

    // 1) 精确复用：同 templateId/assetId 已存储过的图直接复用，跳过 AI 生图（免费）。
    const cached = await this.store.findExisting(templateId, asset.id);
    if (cached) {
      this.logger.log(`复用已生成图片 ${templateId}/${asset.id}（跳过 AI 生图）`);
      return { ...asset, provider: asset.provider ?? 'ai-image', status: 'generated', ...cached };
    }

    // 2) 语义/词法索引复用：按素材库命中一张现成的近似图（如给「咖啡」或图标复用现成图）。
    const lookup = this.buildLookupContext(asset);
    const indexed = await this.store.findByIndex?.(lookup);
    if (indexed) {
      this.logger.log(`按素材库索引复用图片 → ${templateId}/${asset.id}（跳过 AI 生图）`);
      return { ...asset, provider: asset.provider ?? 'ai-image', status: 'generated', ...indexed };
    }

    if (asset.provider === 'placeholder') {
      return this.withPlaceholderFallback(asset, 'asset requested placeholder provider');
    }

    // library 策略：只白嫖素材库，库里没命中就占位、绝不生图。
    if (strategy === 'library') {
      return this.withPlaceholderFallback(asset, 'library strategy: no match, not generating');
    }

    // generate 策略：库未命中 → 调 AI 生图。

    const imageModel = this.config.ai.image.model ?? this.config.ai.models.image;
    const imageConfig = toImageGenerationConfig(this.config.ai.image, imageModel);
    if (!asset.prompt) {
      return this.withPlaceholderFallback(asset, 'asset has no image prompt');
    }
    if (!imageModel) {
      return this.withPlaceholderFallback(asset, 'AI_IMAGE_MODEL is not configured');
    }
    if (!imageConfig) {
      return this.withPlaceholderFallback(asset, 'AI image API key is not configured');
    }

    try {
      const generate = () =>
        generateImageBytes(imageConfig, this.buildImagePrompt(asset), {
          aspectRatio: asset.aspectRatio,
          outputFormat: imageConfig.outputFormat ?? 'png',
        });
      const imageBytes = this.generationQueue
        ? await this.generationQueue.runImage(generate)
        : await generate();
      // 存储时带上语义 context，存储层可顺便建索引供日后复用。
      const stored = await this.store.save(templateId, asset.id, imageBytes, lookup);
      return {
        ...asset,
        provider: 'ai-image',
        status: 'generated',
        url: stored.url,
        storageKey: stored.storageKey,
      };
    } catch (error) {
      const reason = `image generation failed: ${this.errorMessage(error)}`;
      this.logger.warn(
        `Falling back to placeholder for template asset ${templateId}/${asset.id}: ${reason}`,
      );
      return this.withPlaceholderFallback(asset, reason);
    }
  }

  private signAssetUrl(asset: VisualAsset): VisualAsset {
    if (!asset.url || !asset.storageKey || !this.config.jwt.secret) {
      return asset;
    }
    return {
      ...asset,
      url: appendAssetSignature(asset.url, asset.storageKey, this.config.jwt.secret),
    };
  }

  private buildImagePrompt(asset: VisualAsset): string {
    const lines = [
      asset.prompt,
      asset.alt ? `Subject / alt text: ${asset.alt}` : undefined,
      asset.role ? `UI role: ${asset.role}` : undefined,
      asset.aspectRatio ? `Target aspect ratio: ${asset.aspectRatio}` : undefined,
      'Create a polished raster image suitable for direct use inside a UI template.',
      'Avoid watermarks, UI chrome, tiny illegible text, and generic stock-photo framing.',
    ].filter(Boolean);
    return lines.join('\n');
  }

  /**
   * 从 asset 抽出语义检索上下文，供存储层建索引 / 按索引复用。
   * 当前只透传 role/alt/prompt；category/keywords 留给未来的分类器/规则填充。
   */
  private buildLookupContext(asset: VisualAsset): AssetLookupContext {
    return {
      role: asset.role,
      alt: asset.alt,
      prompt: asset.prompt,
    };
  }

  private withPlaceholderFallback(asset: VisualAsset, reason: string): VisualAsset {
    const defaults = ROLE_PLACEHOLDERS[asset.role ?? ''] ?? ROLE_PLACEHOLDERS.default;
    return {
      ...asset,
      provider: 'placeholder',
      status: 'fallback',
      fallbackReason: this.truncateReason(reason),
      placeholder: {
        title: asset.placeholder?.title ?? asset.alt ?? defaults.title,
        iconColor: asset.placeholder?.iconColor ?? defaults.iconColor,
      },
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private truncateReason(reason: string): string {
    return reason.length > 240 ? `${reason.slice(0, 237)}...` : reason;
  }
}
