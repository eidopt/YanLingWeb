/**
 * 可扩展的生图 Provider 适配层。
 *
 * 设计原则（与对话侧 modelCapabilities / ProviderAdapter 对齐）：
 *  - URL 完全由配置驱动：支持在 AI_IMAGE_BASE_URL 中填基础前缀（如 .../v1）或完整
 *    endpoint URL（如 https://api.minimax.cn/v1/images/generations），不硬编码域名。
 *  - 注册表 + 策略模式：通过 `AI_IMAGE_PROVIDER` 显式指定或按 URL/模型族自动匹配适配器，
 *    新增供应商或生图协议只需注册一个新的 ImageProviderAdapter，无需改动业务服务。
 *  - 谨慎重试策略：生图请求普遍非幂等且按次计费，默认 `maxRetries = 0`（超时与 4xx 绝不重试），
 *    仅在显式配置 `maxRetries > 0` 且遇到 429/502/503/504 时做有限退避重试。
 */

export type ImageOutputFormat = 'png' | 'jpeg' | 'webp';

export interface ImageGenerationRequest {
  prompt: string;
  size?: string;
  aspectRatio?: string;
  outputFormat?: ImageOutputFormat;
}

export interface ImageGenerationConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  /** 可选显式适配器 id（来自 AI_IMAGE_PROVIDER），优先级高于自动推断。 */
  provider?: string;
  /** 单次请求超时毫秒数，默认 300_000 ms（生图服务端耗时较长）。 */
  timeoutMs?: number;
  /** 允许的瞬时故障重试次数，默认 0（非幂等防重复扣费）。 */
  maxRetries?: number;
  /** 全局期望输出格式覆盖（来自 AI_IMAGE_OUTPUT_FORMAT）。 */
  outputFormat?: ImageOutputFormat;
}

export interface ImageProviderAdapter {
  readonly id: string;
  matches(config: ImageGenerationConfig): boolean;
  generate(config: ImageGenerationConfig, request: ImageGenerationRequest): Promise<Buffer>;
}

interface OpenAIImageItem {
  b64_json?: string;
  url?: string;
  error?: { code?: string | number; message?: string };
}

interface OpenAIImageResponse {
  data?: OpenAIImageItem[];
  error?: { code?: string | number; message?: string };
}

interface MiniMaxNativeImageResponse {
  data?: {
    image_base64?: string[];
    image_urls?: string[];
  };
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
}

class RetryableHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'RetryableHttpError';
  }
}

export const DEFAULT_IMAGE_SIZE = '1024x1024';
export const DEFAULT_IMAGE_TIMEOUT_MS = 300_000;
export const DEFAULT_IMAGE_MAX_RETRIES = 0;

const RETRYABLE_HTTP_STATUSES = new Set([429, 502, 503, 504]);
const MAX_CONFIGURED_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const IMAGE_DOWNLOAD_MAX_TIMEOUT_MS = 120_000;

const VERSION_PREFIX_RE = /(?:^|\/)(?:v\d+(?:alpha|beta)?|openai|api)$/i;
const KNOWN_ENDPOINT_SUFFIX_RE =
  /\/(?:images\/generations|images\/edits|image_generation|generations|t2i|text2img)$/i;
const VERSION_PLUS_ENDPOINT_RE = /\/v\d+(?:alpha|beta)?\/.+/i;

const MINIMAX_H3_SIZE_BY_RATIO: Record<string, string> = {
  '1:1': '1024x1024',
  '16:9': '1280x720',
  '9:16': '720x1280',
  '4:3': '1152x864',
  '3:4': '864x1152',
  '3:2': '1248x832',
  '2:3': '832x1248',
  '21:9': '1344x576',
};

const OPENAI_SIZE_BY_RATIO: Record<string, string> = {
  '1:1': '1024x1024',
  '16:9': '1536x1024',
  '4:3': '1536x1024',
  '3:2': '1536x1024',
  '21:9': '1536x1024',
  '9:16': '1024x1536',
  '3:4': '1024x1536',
  '2:3': '1024x1536',
};

const MINIMAX_NATIVE_RATIOS = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']);

/**
 * 解析最终请求的完整生图 URL：
 *  - 若配置本身已是完整 endpoint（如 https://api.minimax.cn/v1/images/generations 或
 *    https://other.vendor.com/v2/text2img），原样保留，避免双拼路径导致 404；
 *  - 若配置是前缀（如 https://api.openai.com/v1 或 https://api.minimaxi.com/v1），按需拼接默认路径。
 */
export function resolveImageEndpointUrl(
  baseUrl: string | undefined,
  defaultEndpointPath: string,
): string {
  const normalizedPath = defaultEndpointPath.startsWith('/')
    ? defaultEndpointPath
    : `/${defaultEndpointPath}`;
  const raw = baseUrl?.trim().replace(/\/+$/, '');
  if (!raw) {
    return `https://api.openai.com/v1${normalizedPath}`;
  }
  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    const isFullEndpoint =
      KNOWN_ENDPOINT_SUFFIX_RE.test(pathname) ||
      (VERSION_PLUS_ENDPOINT_RE.test(pathname) && !VERSION_PREFIX_RE.test(pathname));
    if (isFullEndpoint) {
      return parsed.toString().replace(/\/+$/, '');
    }
    return `${raw}${normalizedPath}`;
  } catch {
    return KNOWN_ENDPOINT_SUFFIX_RE.test(raw) ? raw : `${raw}${normalizedPath}`;
  }
}

export function normalizeAspectRatio(aspectRatio?: string): string | undefined {
  const trimmed = aspectRatio?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace('/', ':');
}

export function resolveSizeByRatio(
  aspectRatio: string | undefined,
  ratioTable: Record<string, string>,
  fallbackSize: string = DEFAULT_IMAGE_SIZE,
): string {
  const normalized = normalizeAspectRatio(aspectRatio);
  if (!normalized) {
    return fallbackSize;
  }
  return ratioTable[normalized] ?? fallbackSize;
}

function resolveTimeoutMs(timeoutMs?: number): number {
  if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return Math.floor(timeoutMs);
  }
  return DEFAULT_IMAGE_TIMEOUT_MS;
}

function resolveMaxRetries(maxRetries?: number): number {
  if (typeof maxRetries === 'number' && Number.isFinite(maxRetries) && maxRetries >= 0) {
    return Math.min(MAX_CONFIGURED_RETRIES, Math.floor(maxRetries));
  }
  return DEFAULT_IMAGE_MAX_RETRIES;
}

function extractUrlHost(baseUrl?: string): string {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return '';
  }
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function extractUrlPathname(baseUrl?: string): string {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return '';
  }
  try {
    return new URL(trimmed).pathname.replace(/\/+$/, '').toLowerCase();
  } catch {
    return '';
  }
}

function isAbortOrTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === 'AbortError' || error.name === 'TimeoutError';
}

function formatErrorPayload(status: number, bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { code?: string | number; message?: string };
      base_resp?: { status_code?: number; status_msg?: string };
      message?: string;
    };
    if (parsed.error?.message) {
      const codePrefix = parsed.error.code !== undefined ? `[${parsed.error.code}] ` : '';
      return `HTTP ${status}: ${codePrefix}${parsed.error.message}`;
    }
    if (parsed.base_resp?.status_msg) {
      const codePrefix =
        parsed.base_resp.status_code !== undefined ? `[${parsed.base_resp.status_code}] ` : '';
      return `HTTP ${status}: ${codePrefix}${parsed.base_resp.status_msg}`;
    }
    if (parsed.message) {
      return `HTTP ${status}: ${parsed.message}`;
    }
  } catch {
    // 非 JSON 文本走原样截断输出。
  }
  const summary = bodyText.trim().slice(0, 300);
  return summary ? `HTTP ${status}: ${summary}` : `HTTP ${status}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJsonWithCarefulRetry<T>(
  endpointUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
  maxRetries: number,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const responseText = await response.text();
      if (!response.ok) {
        const message = formatErrorPayload(response.status, responseText);
        if (RETRYABLE_HTTP_STATUSES.has(response.status)) {
          throw new RetryableHttpError(message, response.status);
        }
        throw new Error(message);
      }
      return JSON.parse(responseText) as T;
    } catch (error) {
      // 超时 / Abort 及 4xx 客户端错误均不可盲目重试，避免非幂等生图重复计费。
      const canRetry =
        attempt < maxRetries &&
        !isAbortOrTimeoutError(error) &&
        (error instanceof RetryableHttpError ||
          !(error instanceof Error && /^HTTP 4\d\d/.test(error.message)));
      if (!canRetry) {
        throw error;
      }
      await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
    }
  }
  throw new Error('image request exhausted retries unexpectedly');
}

async function downloadImageBuffer(url: string, timeoutMs: number): Promise<Buffer> {
  let current = url;
  for (let hop = 0; hop < 3; hop += 1) {
    assertSafeImageDownloadUrl(current);
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.min(timeoutMs, IMAGE_DOWNLOAD_MAX_TIMEOUT_MS)),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('image redirect missing location');
      }
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) {
      throw new Error(`failed to download generated image (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error('image download exceeded redirect limit');
}

export function assertSafeImageDownloadUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('image url is not absolute');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('image url protocol is not allowed');
  }
  if (isBlockedImageHost(parsed.hostname)) {
    throw new Error('image url host is not public');
  }
}

function isBlockedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '::1' ||
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd')
  ) {
    return true;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) {
    return false;
  }
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 10 || a === 127 || a === 0 || a >= 224) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  return a === 100 && b >= 64 && b <= 127;
}

async function extractOpenAIImageBytes(
  payload: OpenAIImageResponse,
  timeoutMs: number,
): Promise<Buffer> {
  if (payload.error?.message) {
    const codePrefix = payload.error.code !== undefined ? `[${payload.error.code}] ` : '';
    throw new Error(`image provider error: ${codePrefix}${payload.error.message}`);
  }
  const item = payload.data?.[0];
  if (item?.error?.message) {
    const codePrefix = item.error.code !== undefined ? `[${item.error.code}] ` : '';
    throw new Error(`image generation rejected: ${codePrefix}${item.error.message}`);
  }
  if (item?.b64_json) {
    return Buffer.from(item.b64_json, 'base64');
  }
  if (item?.url) {
    return downloadImageBuffer(item.url, timeoutMs);
  }
  throw new Error('image provider returned no image payload');
}

/**
 * MiniMax 原生 `/v1/image_generation` 适配器（用于 `image-01` / `image-01-live` 等原生协议模型）。
 */
export const MiniMaxNativeImageAdapter: ImageProviderAdapter = {
  id: 'minimax-native',
  matches(config) {
    const pathname = extractUrlPathname(config.baseUrl);
    if (pathname.endsWith('/image_generation')) {
      return true;
    }
    return /^image-01/i.test(config.model.trim());
  },
  async generate(config, request) {
    const endpointUrl = resolveImageEndpointUrl(config.baseUrl, '/image_generation');
    const timeoutMs = resolveTimeoutMs(config.timeoutMs);
    const maxRetries = resolveMaxRetries(config.maxRetries);
    const ratio = normalizeAspectRatio(request.aspectRatio);
    const aspectRatio = ratio && MINIMAX_NATIVE_RATIOS.has(ratio) ? ratio : '1:1';

    const payload = await postJsonWithCarefulRetry<MiniMaxNativeImageResponse>(
      endpointUrl,
      config.apiKey,
      {
        model: config.model,
        prompt: request.prompt,
        n: 1,
        aspect_ratio: aspectRatio,
        response_format: 'base64',
      },
      timeoutMs,
      maxRetries,
    );

    if (payload.base_resp && payload.base_resp.status_code !== 0) {
      throw new Error(
        `MiniMax image error [${payload.base_resp.status_code ?? 'unknown'}]: ` +
          `${payload.base_resp.status_msg ?? 'unknown error'}`,
      );
    }
    const b64 = payload.data?.image_base64?.[0];
    if (b64) {
      return Buffer.from(b64, 'base64');
    }
    const url = payload.data?.image_urls?.[0];
    if (url) {
      return downloadImageBuffer(url, timeoutMs);
    }
    throw new Error('MiniMax native image provider returned no image payload');
  },
};

/**
 * MiniMax H3 系列（OpenAI Images 兼容协议 `/v1/images/generations`）适配器：
 *  - 默认请求 `output_format: 'png'`（覆盖官方默认的 jpeg，保证本地 .png 文件编码一致）；
 *  - 将模板 `aspectRatio` 映射为满足总像素 `[655360, 20000000]` 与比例 `[1:3, 3:1]` 的尺寸；
 *  - 仅传 `size` 而不混传 `aspect_ratio`/`area`，避免 400 参数冲突。
 */
export const MiniMaxOpenAIImageAdapter: ImageProviderAdapter = {
  id: 'minimax',
  matches(config) {
    if (MiniMaxNativeImageAdapter.matches(config)) {
      return false;
    }
    const host = extractUrlHost(config.baseUrl);
    if (host.includes('minimax')) {
      return true;
    }
    return /^minimax-/i.test(config.model.trim());
  },
  async generate(config, request) {
    const endpointUrl = resolveImageEndpointUrl(config.baseUrl, '/images/generations');
    const timeoutMs = resolveTimeoutMs(config.timeoutMs);
    const maxRetries = resolveMaxRetries(config.maxRetries);
    const size = request.size ?? resolveSizeByRatio(request.aspectRatio, MINIMAX_H3_SIZE_BY_RATIO);
    const outputFormat = config.outputFormat ?? request.outputFormat ?? 'png';

    const payload = await postJsonWithCarefulRetry<OpenAIImageResponse>(
      endpointUrl,
      config.apiKey,
      {
        model: config.model,
        prompt: request.prompt,
        n: 1,
        size,
        output_format: outputFormat,
      },
      timeoutMs,
      maxRetries,
    );
    return extractOpenAIImageBytes(payload, timeoutMs);
  },
};

/**
 * 通用 OpenAI Images 兼容适配器（OpenAI `gpt-image-*`/`dall-e-*` 及其他兼容网关兜底）。
 */
export const OpenAICompatibleImageAdapter: ImageProviderAdapter = {
  id: 'openai-compatible',
  matches() {
    return true;
  },
  async generate(config, request) {
    const endpointUrl = resolveImageEndpointUrl(config.baseUrl, '/images/generations');
    const timeoutMs = resolveTimeoutMs(config.timeoutMs);
    const maxRetries = resolveMaxRetries(config.maxRetries);
    const size = request.size ?? resolveSizeByRatio(request.aspectRatio, OPENAI_SIZE_BY_RATIO);
    const explicitOrGptOutputFormat =
      config.outputFormat ??
      (/^gpt-image/i.test(config.model.trim()) ? request.outputFormat : undefined);

    const body: Record<string, unknown> = {
      model: config.model,
      prompt: request.prompt,
      n: 1,
      size,
      ...(explicitOrGptOutputFormat ? { output_format: explicitOrGptOutputFormat } : {}),
    };

    const payload = await postJsonWithCarefulRetry<OpenAIImageResponse>(
      endpointUrl,
      config.apiKey,
      body,
      timeoutMs,
      maxRetries,
    );
    return extractOpenAIImageBytes(payload, timeoutMs);
  },
};

const REGISTERED_ADAPTERS: ImageProviderAdapter[] = [
  MiniMaxNativeImageAdapter,
  MiniMaxOpenAIImageAdapter,
  OpenAICompatibleImageAdapter,
];

const PROVIDER_ALIASES: Record<string, string> = {
  openai: 'openai-compatible',
  'openai-compatible': 'openai-compatible',
  openaiCompatible: 'openai-compatible',
  minimax: 'minimax',
  'minimax-h3': 'minimax',
  'minimax-native': 'minimax-native',
};

/**
 * 注册扩展适配器（插入默认兜底适配器之前，优先于内置自动识别匹配）。
 */
export function registerImageProviderAdapter(adapter: ImageProviderAdapter): void {
  const existingIdx = REGISTERED_ADAPTERS.findIndex((item) => item.id === adapter.id);
  if (existingIdx >= 0) {
    REGISTERED_ADAPTERS[existingIdx] = adapter;
    return;
  }
  const insertAt = Math.max(0, REGISTERED_ADAPTERS.length - 1);
  REGISTERED_ADAPTERS.splice(insertAt, 0, adapter);
}

/**
 * 解析生效的生图适配器：
 *  1. 优先匹配显式配置的 `config.provider`（AI_IMAGE_PROVIDER）；
 *  2. 否则按注册顺序自动识别（MiniMax 原生 → MiniMax OpenAI 兼容 → 通用 OpenAI 兼容）。
 */
export function resolveImageProviderAdapter(config: ImageGenerationConfig): ImageProviderAdapter {
  const explicitProvider = config.provider?.trim();
  if (explicitProvider) {
    const normalizedId = PROVIDER_ALIASES[explicitProvider] ?? explicitProvider.toLowerCase();
    const matchedByProvider = REGISTERED_ADAPTERS.find((adapter) => adapter.id === normalizedId);
    if (matchedByProvider) {
      return matchedByProvider;
    }
    throw new Error(`Unsupported AI_IMAGE_PROVIDER: ${explicitProvider}`);
  }
  return (
    REGISTERED_ADAPTERS.find((adapter) => adapter.matches(config)) ?? OpenAICompatibleImageAdapter
  );
}
