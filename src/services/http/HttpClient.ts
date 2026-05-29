export interface HttpJsonResult<T> {
  data: T;
  response: Response;
}

export interface HttpStreamEvent {
  data: string;
}

export interface HttpStreamResult {
  events: AsyncIterable<HttpStreamEvent>;
  response: Response;
}

/**
 * Per-request retry configuration for the `json()` path.
 *
 * Retries are only attempted for idempotent-safe, server-throttling responses
 * (HTTP 429 and, when {@link RetryOptions.retryOn503} is enabled, 503). The
 * `Retry-After` header is honored (seconds or HTTP-date); otherwise an
 * exponential backoff is used. Streaming/SSE calls are never retried
 * automatically because their bodies are consumed lazily and may not be
 * idempotent.
 */
export interface RetryOptions {
  /** Maximum number of attempts including the first. Defaults to 3. */
  maxAttempts?: number;
  /** Base backoff in ms used for exponential fallback when no Retry-After. Defaults to 500ms. */
  baseDelayMs?: number;
  /** Hard cap on any single backoff delay in ms. Defaults to 4000ms. */
  maxDelayMs?: number;
  /** Also retry on HTTP 503 (Service Unavailable). Defaults to true. */
  retryOn503?: boolean;
}

export type HttpJsonOptions = RequestInit & {
  auth?: boolean;
  /**
   * Enable / tune the centralized retry behavior for this request.
   * `true` enables bounded retry with sensible defaults (see
   * {@link RetryOptions}); an object enables retry and overrides individual
   * fields; `false` / omitted disables retry.
   *
   * Retry is opt-in (default off) so existing callers — notably
   * `TemplateService`, which surfaces 429 + `Retry-After` to its own
   * autosave retry loop — keep their current behavior and we never
   * double-retry the same throttled request.
   */
  retry?: boolean | RetryOptions;
};

/**
 * Cross-cutting hooks invoked around every underlying fetch. Interceptors are
 * applied to both `json()` and `stream()` requests, and run once per attempt
 * (so a request interceptor sees each retry). They are optional and the
 * default `FetchHttpClient` works with none configured.
 */
export interface HttpInterceptors {
  /**
   * Invoked before each fetch with the resolved request init. May return a
   * (possibly new) RequestInit to use instead. Receives the request `path`.
   */
  onRequest?: (path: string, init: RequestInit) => RequestInit | void | Promise<RequestInit | void>;
  /**
   * Invoked after each fetch resolves, before retry evaluation. May return a
   * (possibly new) Response to use instead. Receives the request `path`.
   */
  onResponse?: (path: string, response: Response) => Response | void | Promise<Response | void>;
}

export interface HttpClient {
  json<T>(path: string, options?: HttpJsonOptions): Promise<HttpJsonResult<T>>;
  stream(path: string, options?: HttpJsonOptions): Promise<HttpStreamResult>;
}

type TokenProvider = () => string | null;

interface ApiSuccessEnvelope<T = unknown> {
  success: true;
  data: T;
}

function isApiSuccessEnvelope(value: unknown): value is ApiSuccessEnvelope {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as { success?: unknown }).success === true &&
    'data' in value
  );
}

const DEFAULT_RETRY: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 4000,
  retryOn503: true,
};

function resolveRetryOptions(retry: HttpJsonOptions['retry']): Required<RetryOptions> | null {
  if (retry === undefined || retry === false) {
    return null;
  }
  if (retry === true) {
    return DEFAULT_RETRY;
  }
  return {
    maxAttempts: retry.maxAttempts ?? DEFAULT_RETRY.maxAttempts,
    baseDelayMs: retry.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs,
    maxDelayMs: retry.maxDelayMs ?? DEFAULT_RETRY.maxDelayMs,
    retryOn503: retry.retryOn503 ?? DEFAULT_RETRY.retryOn503,
  };
}

function isRetryableStatus(status: number, options: Required<RetryOptions>): boolean {
  return status === 429 || (options.retryOn503 && status === 503);
}

/**
 * Parse a `Retry-After` header (delay in seconds, or an HTTP-date) into a
 * delay in milliseconds. Returns `undefined` when absent or unparseable.
 */
function parseRetryAfterMs(headers: Headers): number | undefined {
  const value = headers.get('retry-after');
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = Date.parse(value);
  if (!Number.isFinite(date)) {
    return undefined;
  }
  return Math.max(0, date - Date.now());
}

function computeBackoffMs(attempt: number, headers: Headers, options: Required<RetryOptions>): number {
  const fromHeader = parseRetryAfterMs(headers);
  if (fromHeader !== undefined) {
    return Math.min(fromHeader, options.maxDelayMs);
  }
  // Exponential fallback: base * 2^(attempt - 1), capped.
  const exponential = options.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(exponential, options.maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FetchHttpClient implements HttpClient {
  constructor(
    private readonly getToken?: TokenProvider,
    private readonly interceptors?: HttpInterceptors,
  ) {}

  async json<T>(path: string, options: HttpJsonOptions = {}): Promise<HttpJsonResult<T>> {
    const response = await this.requestWithRetry(path, options);
    const raw = (await response.json().catch(() => ({}))) as unknown;
    const data = (isApiSuccessEnvelope(raw) ? raw.data : raw) as T;
    return { data, response };
  }

  async stream(path: string, options: HttpJsonOptions = {}): Promise<HttpStreamResult> {
    // Streaming responses are consumed lazily and may not be idempotent, so we
    // never auto-retry them regardless of the `retry` option.
    const { retry: _ignoredRetry, ...rest } = options;
    const response = await this.request(path, rest);
    return {
      response,
      events: readServerSentEvents(response),
    };
  }

  /** Performs the request, transparently retrying on throttling responses. */
  private async requestWithRetry(path: string, options: HttpJsonOptions): Promise<Response> {
    const { retry, ...rest } = options;
    const retryOptions = resolveRetryOptions(retry);

    let attempt = 1;
    for (;;) {
      const response = await this.request(path, rest);

      if (!retryOptions || attempt >= retryOptions.maxAttempts || !isRetryableStatus(response.status, retryOptions)) {
        return response;
      }

      const delayMs = computeBackoffMs(attempt, response.headers, retryOptions);
      // Drain the body so the connection can be reused before retrying.
      await response.body?.cancel().catch(() => undefined);
      await sleep(delayMs);
      attempt += 1;
    }
  }

  private async request(path: string, options: Omit<HttpJsonOptions, 'retry'>): Promise<Response> {
    const { auth = false, headers, ...init } = options;
    const requestHeaders = new Headers(headers);
    const token = this.getToken?.();
    if (auth && token && !requestHeaders.has('authorization')) {
      requestHeaders.set('authorization', `Bearer ${token}`);
    }

    let requestInit: RequestInit = {
      ...init,
      headers: requestHeaders,
    };

    if (this.interceptors?.onRequest) {
      const overridden = await this.interceptors.onRequest(path, requestInit);
      if (overridden) {
        requestInit = overridden;
      }
    }

    const response = await fetch(path, requestInit);

    if (this.interceptors?.onResponse) {
      const overridden = await this.interceptors.onResponse(path, response);
      if (overridden) {
        return overridden;
      }
    }

    return response;
  }
}

async function* readServerSentEvents(response: Response): AsyncIterable<HttpStreamEvent> {
  if (!response.body) {
    throw new Error('Empty event stream response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) {
          continue;
        }
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') {
          continue;
        }
        yield { data };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function resolveHttpClient(clientOrTokenProvider?: HttpClient | TokenProvider): HttpClient {
  if (
    clientOrTokenProvider &&
    typeof clientOrTokenProvider === 'object' &&
    typeof clientOrTokenProvider.json === 'function'
  ) {
    return clientOrTokenProvider;
  }
  return new FetchHttpClient(typeof clientOrTokenProvider === 'function' ? clientOrTokenProvider : undefined);
}
