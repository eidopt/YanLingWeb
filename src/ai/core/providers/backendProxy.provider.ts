import { backendProxyProviderContent as c } from './backendProxy.provider.content';
import {
  NEW_STRUCTURED_SSE_EVENT_TYPES,
  parseSseEnvelope,
  type SseEventEnvelope,
  type SseEventType,
} from './backendProxy.provider.events';
import type { AIProvider, ProviderCapabilities, ProviderRequest, ProviderStreamEvent } from './types';
import { type HttpClient, resolveHttpClient } from 'services/http/HttpClient';

const CAPABILITIES: ProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsParallelToolCalls: true,
  supportsStructuredOutput: true,
  supportsReasoningEffort: true,
  supportsServerSideContext: false,
  reasoningMode: 'none',
  cacheStrategy: 'response_id',
  supportsDeveloperRole: true,
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

  /** 检查是否已被 cancel() 中止；封装为方法以避免 TS 控制流分析误判。 */
  private isAborted(): boolean {
    return this.aborted;
  }

  /** 当前会话标识；编辑器聊天会按模板设置。 */
  private conversationId: string | null = null;
  /** 每个会话最近一次 LLM 响应 ID。 */
  private previousResponseIdsByConversation = new Map<string, string>();

  /**
   * @param getToken 返回当前 JWT token；未登录时返回 null。
   * @param onAuthExpired 后端返回 401 时触发；调用方应清理登录态并跳转登录。
   * @param onStructuredEvent 后端 envelope 流中的新结构化事件 (tool_start / pipeline_stage_* / ...) 触发；老事件仍 yield 为 ProviderStreamEvent 形状。
   */
  constructor(
    private readonly getToken: () => string | null,
    private readonly onAuthExpired?: () => void,
    httpClient?: HttpClient,
    public onStructuredEvent?: (envelope: SseEventEnvelope<SseEventType, unknown>) => void,
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
        if (this.isAborted()) {
          break;
        }
        const parsed = parseSseEnvelope(streamEvent.data);
        if (!parsed.ok) {
          // 静默 skip + console.warn, 不断流

          console.warn(`[SSE] skip envelope: ${parsed.reason}`);
          continue;
        }
        const envelope = parsed.envelope;
        if (NEW_STRUCTURED_SSE_EVENT_TYPES.has(envelope.type)) {
          // 新类型: 调 onStructuredEvent 订阅口 + console.log
          this.onStructuredEvent?.(envelope);
          // eslint-disable-next-line no-console
          console.log('[SSE]', envelope.type, envelope.payload);
          continue;
        }
        // 老类型: 拆 envelope, 转回原 ProviderStreamEvent 形状 yield 出去
        const legacy = convertEnvelopeToLegacyProviderEvent(envelope);
        if (legacy === null) {
          console.warn(`[SSE] cannot convert envelope type: ${envelope.type}`);
          continue;
        }
        if (legacy.type === 'done') {
          if (hasResponseId(legacy)) {
            this.previousResponseIdsByConversation.set(conversationId, legacy.response_id);
          }
          yield legacy;
          return;
        }
        yield legacy;
      }
    } catch (err) {
      if (!this.isAborted() && !abortController.signal.aborted) {
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

function convertEnvelopeToLegacyProviderEvent(e: SseEventEnvelope<SseEventType, unknown>): ProviderStreamEvent | null {
  switch (e.type) {
    case 'text_delta': {
      const payload = e.payload as { text: string };
      return { type: 'text_delta', text: payload.text };
    }
    case 'tool_call': {
      const payload = e.payload as { id: string; name: string; arguments: string };
      return {
        type: 'tool_call',
        id: payload.id,
        name: payload.name,
        arguments: payload.arguments,
      };
    }
    case 'done': {
      const payload = e.payload as {
        usage?: { inputTokens: number; outputTokens: number };
        stopReason?: 'end_turn' | 'max_tokens';
        response_id?: string;
        reasoningContent?: string;
      };
      return {
        type: 'done',
        usage: payload.usage,
        stopReason: payload.stopReason,
        response_id: payload.response_id,
        reasoningContent: payload.reasoningContent,
      };
    }
    case 'error': {
      const payload = e.payload as { message: string };
      return { type: 'error', message: payload.message };
    }
    default:
      return null; // 新类型不转换
  }
}
