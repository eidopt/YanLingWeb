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
 *
 * Maintains a conversation ID and tracks the previous response ID for
 * providers that support prompt caching (OpenAI, Claude, etc.).
 * The backend receives these via headers and can forward them to the LLM.
 */
export class BackendProxyProvider implements AIProvider {
  readonly name = 'backend-proxy';
  private aborted = false;
  private abortController: AbortController | null = null;

  /** Active conversation identifier; editor chat sets this per template. */
  private conversationId: string | null = null;
  /** IDs of the most recent LLM responses, keyed by conversation. */
  private previousResponseIdsByConversation = new Map<string, string>();

  /**
   * @param getToken - Returns the current JWT token (or null if not logged in).
   * @param onAuthExpired - Optional callback fired when the backend returns 401.
   *   The caller should clear auth state and redirect to login.
   */
  constructor(
    private readonly getToken: () => string | null,
    private readonly onAuthExpired?: () => void,
  ) {}

  getCapabilities(): ProviderCapabilities {
    return CAPABILITIES;
  }

  /** Assign the active conversation ID, usually scoped to one template. */
  setConversationId(id: string): void {
    this.conversationId = id;
  }

  getConversationId(): string | null {
    return this.conversationId;
  }

  resetConversation(): void {
    this.conversationId = null;
    this.previousResponseIdsByConversation.clear();
    this.aborted = false;
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent> {
    this.aborted = false;

    const token = this.getToken();
    if (!token) {
      yield { type: 'error', message: '未登录，请先登录后再使用 AI 功能' };
      return;
    }

    const abortController = new AbortController();
    this.abortController = abortController;
    const clearAbortController = () => {
      if (this.abortController === abortController) {
        this.abortController = null;
      }
    };

    // Ensure a stable conversation ID exists for cache purposes
    this.conversationId ??=
      `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const conversationId = this.conversationId;
    const previousResponseId =
      this.previousResponseIdsByConversation.get(conversationId);

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-conversation-id': conversationId,
    };

    if (previousResponseId) {
      headers['x-previous-response-id'] = previousResponseId;
    }

    let res: Response;
    try {
      res = await fetch('/api/ai/stream', {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: abortController.signal,
      });
    } catch (err) {
      clearAbortController();
      if (abortController.signal.aborted) {
        return;
      }
      throw err;
    }

    if (!res.ok) {
      // 401 = JWT expired or invalid → notify caller to clear auth
      if (res.status === 401) {
        this.onAuthExpired?.();
        yield { type: 'error', message: '登录已过期，请重新登录。' };
        clearAbortController();
        return;
      }

      const text = await res.text().catch(() => '');
      let message = `HTTP ${res.status}`;
      try {
        const json = JSON.parse(text) as { message?: string };
        if (json.message) {message = json.message;}
      } catch { /* use raw text */ }
      yield { type: 'error', message };
      clearAbortController();
      return;
    }

    // Extract cache metadata from response headers
    const respIdHeader = res.headers.get('x-response-id');
    if (respIdHeader) {
      this.previousResponseIdsByConversation.set(conversationId, respIdHeader);
    }

    // body is always present on a successful fetch Response
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const reader = res.body!.getReader();

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      // cancel() sets this.aborted from outside; TS can't see cross-method mutation
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (!this.aborted && !abortController.signal.aborted) {
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
            if (event.type === 'done') {
              // Track response ID from done event if present
              // (the provider may embed it in usage metadata)
              const doneEvent = event as unknown as Record<string, unknown>;
              if (typeof doneEvent.response_id === 'string') {
                this.previousResponseIdsByConversation.set(
                  conversationId,
                  doneEvent.response_id,
                );
              }
              yield event;
              return;
            }
            yield event;
          } catch { /* skip malformed lines */ }
        }
      }
    } finally {
      if (abortController.signal.aborted) {
        await reader.cancel().catch(() => undefined);
      }
      reader.releaseLock();
      clearAbortController();
    }
  }

  cancel(): void {
    this.aborted = true;
    this.abortController?.abort();
    this.abortController = null;
  }
}
