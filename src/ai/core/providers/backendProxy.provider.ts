import { backendProxyProviderContent as c } from './backendProxy.provider.content';
import type { AIProvider, ProviderCapabilities, ProviderRequest, ProviderStreamEvent } from './types';
import { type HttpClient, resolveHttpClient } from 'services/http/HttpClient';

const CAPABILITIES: ProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsParallelToolCalls: true,
  supportsStructuredOutput: true,
  supportsReasoningEffort: true,
  supportsServerSideContext: false,
};

/**
 * 通过 BFF 代理把 ProviderRequest 转发给后端。
 * 后端负责保管 API key 并执行限流。
 *
 * 维护会话 ID，并记录支持 prompt caching 的 provider 最近一次 response ID。
 * 后端会通过请求头接收这些值，再按需转发给 LLM。
 */
export class BackendProxyProvider implements AIProvider {
  readonly name = 'backend-proxy';
  private aborted = false;
  private abortController: AbortController | null = null;

  /** 当前会话标识；编辑器聊天会按模板设置。 */
  private conversationId: string | null = null;
  /** 每个会话最近一次 LLM 响应 ID。 */
  private previousResponseIdsByConversation = new Map<string, string>();

  /**
   * @param getToken 返回当前 JWT token；未登录时返回 null。
   * @param onAuthExpired 后端返回 401 时触发；调用方应清理登录态并跳转登录。
   */
  constructor(
    private readonly getToken: () => string | null,
    private readonly onAuthExpired?: () => void,
    httpClient?: HttpClient,
  ) {
    this.http = httpClient ?? resolveHttpClient(getToken);
  }

  private readonly http: HttpClient;

  getCapabilities(): ProviderCapabilities {
    return CAPABILITIES;
  }

  /** 设置当前会话 ID，通常按模板隔离。 */
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
      yield { type: 'error', message: c.unauthenticated };
      return;
    }

    const abortController = new AbortController();
    this.abortController = abortController;
    const clearAbortController = () => {
      if (this.abortController === abortController) {
        this.abortController = null;
      }
    };

    // 为缓存场景确保会话 ID 稳定存在。
    this.conversationId ??= `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const conversationId = this.conversationId;
    const previousResponseId = this.previousResponseIdsByConversation.get(conversationId);

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-conversation-id': conversationId,
    };

    if (previousResponseId) {
      headers['x-previous-response-id'] = previousResponseId;
    }

    let streamResult: Awaited<ReturnType<HttpClient['stream']>>;
    try {
      streamResult = await this.http.stream('/api/proxy/ai/stream', {
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

    const { response: res, events } = streamResult;
    if (!res.ok) {
      // 401 表示 JWT 过期或无效，需要通知调用方清理登录状态。
      if (res.status === 401) {
        this.onAuthExpired?.();
        yield { type: 'error', message: c.authExpired };
        clearAbortController();
        return;
      }

      const text = await res.text().catch(() => '');
      let message = `HTTP ${res.status}`;
      try {
        const json = JSON.parse(text) as { message?: string };
        if (json.message) {
          message = json.message;
        }
      } catch {
        /* 使用原始文本。 */
      }
      yield { type: 'error', message };
      clearAbortController();
      return;
    }

    // 从响应头提取缓存元数据。
    const respIdHeader = res.headers.get('x-response-id');
    if (respIdHeader) {
      this.previousResponseIdsByConversation.set(conversationId, respIdHeader);
    }

    try {
      for await (const streamEvent of events) {
        // cancel() 会从其他方法修改 this.aborted，TS 无法识别跨方法变更。
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (this.aborted) {
          break;
        }
        try {
          const event = JSON.parse(streamEvent.data) as ProviderStreamEvent;
          if (event.type === 'done') {
            // 如果 done 事件包含 response ID，则记录下来；provider 可能把它放在 usage metadata 中。
            if (hasResponseId(event)) {
              this.previousResponseIdsByConversation.set(conversationId, event.response_id);
            }
            yield event;
            return;
          }
          yield event;
        } catch {
          // 跳过格式异常的行。
        }
      }
    } catch (err) {
      // cancel() 会跨方法修改 this.aborted；TS 只能看到当前方法体。
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!this.aborted && !abortController.signal.aborted) {
        throw err;
      }
    } finally {
      clearAbortController();
    }
  }

  cancel(): void {
    this.aborted = true;
    this.abortController?.abort();
    this.abortController = null;
  }
}

function hasResponseId(event: ProviderStreamEvent): event is ProviderStreamEvent & { response_id: string } {
  return 'response_id' in event && typeof event.response_id === 'string';
}
