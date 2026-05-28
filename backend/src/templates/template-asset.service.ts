import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import {
  applyVisualAssetsToLayoutDocument,
  buildVisualAssetManifest,
  isAllowedTemplateImageSrc,
  normalizeVisualAssets,
  type VisualAsset,
  type VisualAssetManifest,
} from '@shared/theme-layout/visualAssets';
import OpenAI from 'openai';

import { ConfigService } from '../config/config.service';

export interface ResolvedTemplateVisualAssets {
  visualAssets: VisualAsset[];
  layoutDocument: Record<string, unknown>;
  manifest: VisualAssetManifest | null;
}

interface StoredImage {
  url: string;
  storageKey: string;
}

const DEFAULT_IMAGE_SIZE = '1024x1024';

const ROLE_PLACEHOLDERS: Record<string, { title: string; iconColor: string; }> = {
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

function safePathSegment(value: string): string {
  const segment = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return segment || 'asset';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncateReason(reason: string): string {
  return reason.length > 240 ? `${reason.slice(0, 237)}...` : reason;
}

@Injectable()
export class TemplateAssetService {
  private readonly logger = new Logger(TemplateAssetService.name);

  constructor(private readonly config: ConfigService) {}

  async resolveVisualAssetsForTemplate(
    templateId: string,
    layoutDocument: Record<string, unknown>,
    value: unknown,
  ): Promise<ResolvedTemplateVisualAssets> {
    const visualAssets = normalizeVisualAssets(value);
    if (!visualAssets.length) {
      return { visualAssets: [], layoutDocument, manifest: null };
    }

    const resolvedAssets: VisualAsset[] = [];
    for (const asset of visualAssets) {
      resolvedAssets.push(await this.resolveVisualAsset(templateId, asset));
    }

    const resolvedLayoutDocument = applyVisualAssetsToLayoutDocument(
      layoutDocument,
      resolvedAssets,
    );

    return {
      visualAssets: resolvedAssets,
      layoutDocument: resolvedLayoutDocument,
      manifest: buildVisualAssetManifest(templateId, resolvedAssets),
    };
  }

  private async resolveVisualAsset(
    templateId: string,
    asset: VisualAsset,
  ): Promise<VisualAsset> {
    if (asset.url && isAllowedTemplateImageSrc(asset.url)) {
      return {
        ...asset,
        provider: asset.provider ?? (asset.url.startsWith('/template-assets/') ? 'curated' : 'manual'),
        status: asset.status ?? 'generated',
      };
    }

    if (asset.provider === 'placeholder') {
      return this.withPlaceholderFallback(asset, 'asset requested placeholder provider');
    }

    const imageModel = this.config.ai.models.image;
    const apiKey = this.config.ai.apiKey;
    if (!asset.prompt) {
      return this.withPlaceholderFallback(asset, 'asset has no image prompt');
    }
    if (!imageModel) {
      return this.withPlaceholderFallback(asset, 'AI_IMAGE_MODEL is not configured');
    }
    if (!apiKey) {
      return this.withPlaceholderFallback(asset, 'AI API key is not configured');
    }

    try {
      const imageBytes = await this.generateImageBytes(imageModel, asset);
      const stored = await this.storeGeneratedImage(templateId, asset.id, imageBytes);
      return {
        ...asset,
        provider: 'ai-image',
        status: 'generated',
        url: stored.url,
        storageKey: stored.storageKey,
      };
    } catch (error) {
      const reason = `image generation failed: ${errorMessage(error)}`;
      this.logger.warn(
        `Falling back to placeholder for template asset ${templateId}/${asset.id}: ${reason}`,
      );
      return this.withPlaceholderFallback(asset, reason);
    }
  }

  private async generateImageBytes(
    model: string,
    asset: VisualAsset,
  ): Promise<Buffer> {
    const openai = new OpenAI({
      apiKey: this.config.ai.apiKey,
      baseURL: this.config.ai.baseUrl,
    });
    const imagesClient = openai.images as unknown as {
      generate(input: Record<string, unknown>): Promise<unknown>;
    };
    const response = await imagesClient.generate({
      model,
      prompt: this.buildImagePrompt(asset),
      n: 1,
      size: DEFAULT_IMAGE_SIZE,
    });
    const data = (response as { data?: { b64_json?: string; url?: string; }[]; }).data;
    const image = data?.[0];

    if (image?.b64_json) {
      return Buffer.from(image.b64_json, 'base64');
    }

    if (image?.url) {
      const result = await fetch(image.url);
      if (!result.ok) {
        throw new Error(`failed to download generated image (${result.status})`);
      }
      return Buffer.from(await result.arrayBuffer());
    }

    throw new Error('image provider returned no image payload');
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

  private async storeGeneratedImage(
    templateId: string,
    assetId: string,
    imageBytes: Buffer,
  ): Promise<StoredImage> {
    const assetsRoot = this.resolveTemplateAssetsRoot();
    const templateSegment = safePathSegment(templateId);
    const assetSegment = safePathSegment(assetId);
    const relativeStorageKey = path.posix.join(
      'generated',
      templateSegment,
      `${assetSegment}.png`,
    );
    const outputPath = path.join(
      assetsRoot,
      'generated',
      templateSegment,
      `${assetSegment}.png`,
    );

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, imageBytes);

    return {
      url: `/template-assets/${relativeStorageKey}`,
      storageKey: relativeStorageKey,
    };
  }

  private resolveTemplateAssetsRoot(): string {
    const publicCandidates = [
      path.resolve(process.cwd(), 'public'),
      path.resolve(process.cwd(), '..', 'public'),
    ];
    const publicRoot = publicCandidates.find((candidate) => existsSync(candidate))
      ?? publicCandidates[0];
    return path.join(publicRoot, 'template-assets');
  }

  private withPlaceholderFallback(asset: VisualAsset, reason: string): VisualAsset {
    const defaults = ROLE_PLACEHOLDERS[asset.role ?? ''] ?? ROLE_PLACEHOLDERS.default;
    return {
      ...asset,
      provider: 'placeholder',
      status: 'fallback',
      fallbackReason: truncateReason(reason),
      placeholder: {
        title: asset.placeholder?.title ?? asset.alt ?? defaults.title,
        iconColor: asset.placeholder?.iconColor ?? defaults.iconColor,
      },
    };
  }
}
