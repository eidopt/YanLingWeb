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

export type HttpJsonOptions = RequestInit & {
  auth?: boolean;
};

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

export class FetchHttpClient implements HttpClient {
  constructor(private readonly getToken?: TokenProvider) {}

  async json<T>(path: string, options: HttpJsonOptions = {}): Promise<HttpJsonResult<T>> {
    const response = await this.request(path, options);
    const raw = (await response.json().catch(() => ({}))) as unknown;
    const data = (isApiSuccessEnvelope(raw) ? raw.data : raw) as T;
    return { data, response };
  }

  async stream(path: string, options: HttpJsonOptions = {}): Promise<HttpStreamResult> {
    const response = await this.request(path, options);
    return {
      response,
      events: readServerSentEvents(response),
    };
  }

  private async request(path: string, options: HttpJsonOptions): Promise<Response> {
    const { auth = false, headers, ...init } = options;
    const requestHeaders = new Headers(headers);
    const token = this.getToken?.();
    if (auth && token && !requestHeaders.has('authorization')) {
      requestHeaders.set('authorization', `Bearer ${token}`);
    }

    return fetch(path, {
      ...init,
      headers: requestHeaders,
    });
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
