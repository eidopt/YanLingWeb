import {
  type ImageGenerationConfig,
  type ImageGenerationRequest,
  type ImageOutputFormat,
  resolveImageProviderAdapter,
} from './imageProviders';

export type { ImageGenerationConfig, ImageGenerationRequest, ImageOutputFormat };

export interface GenerateImageOptions {
  size?: string;
  aspectRatio?: string;
  outputFormat?: ImageOutputFormat;
}

export interface ResolvedImageEnvConfig {
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  outputFormat?: ImageOutputFormat;
}

/**
 * 将 `config.ai.image` 转换为底层生图配置；缺少 apiKey 或 model 时返回 null。
 */
export function toImageGenerationConfig(
  image: ResolvedImageEnvConfig,
  fallbackModel?: string,
): ImageGenerationConfig | null {
  const model = image.model ?? fallbackModel;
  if (!image.apiKey || !model) {
    return null;
  }
  return {
    apiKey: image.apiKey,
    model,
    ...(image.baseUrl ? { baseUrl: image.baseUrl } : {}),
    ...(image.provider ? { provider: image.provider } : {}),
    ...(image.timeoutMs !== undefined ? { timeoutMs: image.timeoutMs } : {}),
    ...(image.maxRetries !== undefined ? { maxRetries: image.maxRetries } : {}),
    ...(image.outputFormat ? { outputFormat: image.outputFormat } : {}),
  };
}

/**
 * 调用生图 Provider 生成一张图，返回图像字节。
 * 被 TemplateAssetService（模板配图）和 AssetLibraryService（素材库预生成）共用，
 * 底层通过 imageProviders 注册表按配置/适配器路由，便于扩展多种生图模型与完整 URL。
 */
export async function generateImageBytes(
  config: ImageGenerationConfig,
  prompt: string,
  sizeOrOptions?: string | GenerateImageOptions,
): Promise<Buffer> {
  const options: GenerateImageOptions =
    typeof sizeOrOptions === 'string' ? { size: sizeOrOptions } : (sizeOrOptions ?? {});
  const adapter = resolveImageProviderAdapter(config);
  const request: ImageGenerationRequest = {
    prompt,
    ...(options.size ? { size: options.size } : {}),
    ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
    ...(options.outputFormat ? { outputFormat: options.outputFormat } : {}),
  };
  return adapter.generate(config, request);
}
