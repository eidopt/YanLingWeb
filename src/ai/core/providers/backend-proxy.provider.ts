import type {
  AIProvider,
  ProviderCapabilities,
  ProviderRequest,
  ProviderStreamEvent,
} from './types';

const CAPABILITIES: ProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsParallelToolCalls: true,
  supportsStructuredOutput: true,
  supportsReasoningEffort: true,
  supportsServerSideContext: false,
};

/**
 * Sends ProviderRequests to the backend /api/ai/stream endpoint.
 * The backend holds the API key and enforces rate limits.
 */
export class BackendProxyProvider implements AIProvider {
  readonly name = 'backend-proxy';
  private aborted = false;

  constructor(private readonly getToken: () => string | null) {}

  getCapabilities(): ProviderCapabilities {
    return CAPABILITIES;
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    this.aborted = false;

    const token = this.getToken();
    if (!token) {
      yield { type: 'error', message: '未登录，请先登录后再使用 AI 功能' };
      return;
    }

    const res = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = `HTTP ${res.status}`;
      try {
        const json = JSON.parse(text) as { message?: string };
        if (json.message) {message = json.message;}
      } catch { /* use raw text */ }
      yield { type: 'error', message };
      return;
    }

    // body is always present on a successful fetch Response
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const reader = res.body!.getReader();

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      // cancel() sets this.aborted from outside; TS can't see cross-method mutation
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (!this.aborted) {
        const { done, value } = await reader.read();
        if (done) {break;}

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) {continue;}
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') {continue;}

          try {
            const event = JSON.parse(raw) as ProviderStreamEvent;
            yield event;
          } catch { /* skip malformed lines */ }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  cancel(): void {
    this.aborted = true;
  }
}
