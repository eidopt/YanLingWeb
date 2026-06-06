import OpenAI from 'openai';

/** OpenAI Images 调用所需的最小配置。 */
export interface ImageGenerationConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

interface ImageGenerationDataItem {
  b64_json?: string;
  url?: string;
}

interface ImageGenerationResponse {
  data?: ImageGenerationDataItem[];
}

const DEFAULT_IMAGE_SIZE = '1024x1024';

/**
 * 调用 OpenAI Images API 生成一张图，返回 PNG 字节。
 * 被 TemplateAssetService（模板配图）和 AssetLibraryService（素材库预生成）共用，
 * 保证两处生图逻辑一致。
 */
export async function generateImageBytes(
  config: ImageGenerationConfig,
  prompt: string,
  size: string = DEFAULT_IMAGE_SIZE,
): Promise<Buffer> {
  const openai = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
  const response = await openai.images.generate({ model: config.model, prompt, n: 1, size });
  const image = (response as ImageGenerationResponse).data?.[0];

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
