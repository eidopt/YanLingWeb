import { editorAiServiceContent as c } from './editorAi.service.content';
import type { AgentClarificationOption } from '@shared/agent/contracts/agent';
import { type HttpClient, type HttpStreamEvent, resolveHttpClient } from 'services/http/HttpClient';
import type {
  ApplyEditorAiEditInstructionsOptions,
  ApplyEditorAiEditInstructionsResult,
  EditorAiEditInstruction,
} from 'ui/editor/services/aiEditInstructions';
import {
  configureSemanticTargetDefinitions,
  type SemanticTargetDefinitionConfig,
} from 'ui/editor/services/semanticTargets';
import type { ThemeComponentDescriptor, ThemeLayoutDocument, ThemeLayoutNode } from 'ui/layout/types';

export interface EditorAiEvent {
  type:
    | 'text'
    | 'intent_plan'
    | 'tool_start'
    | 'tool_done'
    | 'edit_applied'
    | 'clarification'
    | 'reasoning'
    | 'usage_summary'
    | 'cache_diagnostic'
    | 'error'
    | 'done';
  data: string;
  terminal?: boolean;
}

export interface EditorAiSnapshot {
  id: string;
  document: ThemeLayoutDocument;
  description: string;
  createdAt: string;
}

export interface EditorAiEditCanvasOptions {
  prompt: string;
  model?: string;
  document: ThemeLayoutDocument;
  getCurrentDocument: () => ThemeLayoutDocument;
  onSnapshot?: (snapshot: EditorAiSnapshot) => void;
  pages?: EditorAiPageContext[];
  conversation?: EditorAiConversationMessage[];
  conversationId?: string;
  selectedNode?: ThemeLayoutNode | null;
  selectedDescriptor?: ThemeComponentDescriptor | null;
  clarificationChoice?: AgentClarificationOption | null;
  onEvent: (event: EditorAiEvent) => void;
  applyInstructions: (
    instructions: readonly EditorAiEditInstruction[],
    options?: ApplyEditorAiEditInstructionsOptions,
  ) => ApplyEditorAiEditInstructionsResult;
  signal?: AbortSignal;
}

export interface EditorAiPageContext {
  pageId: string;
  name: string;
  rootNodeId: string;
  isActive?: boolean;
  nodeCount?: number;
  bodyNodeCount?: number;
  footerNodeCount?: number;
  isBlank?: boolean;
}

export interface EditorAiConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface EditorAiRuntimeConfig {
  provider: string;
  model: string;
  models?: {
    pro: string;
    lite?: string;
    image?: string;
  };
  semanticTargets?: SemanticTargetDefinitionConfig[];
}

export interface EditorAiCacheStats {
  totalRequests: number;
  totalCacheHitTokens: number;
  totalCacheMissTokens: number;
  overallCacheHitRate: string;
  byEndpoint: {
    endpoint: string;
    count: number;
    cacheHitTokens: number;
    cacheMissTokens: number;
    hitRate: string;
  }[];
  recentRequests: {
    timestamp: string;
    endpoint: string;
    model: string;
    cacheHitTokens: number | null;
    cacheMissTokens: number | null;
    hitRate: string;
  }[];
}

interface BackendEditorEvent {
  type: string;
  data?: unknown;
  schema?: string;
  payload?: unknown;
}

function eventDataToString(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (data == null) {
    return '';
  }
  return JSON.stringify(data);
}

function getToolEventName(data: unknown): string {
  if (data && typeof data === 'object' && 'name' in data) {
    const name = (data as { name?: unknown }).name;
    return typeof name === 'string' ? name : eventDataToString(data);
  }
  return eventDataToString(data);
}

function getPayloadField(event: BackendEditorEvent, field: string): unknown {
  if (typeof event === 'object' && 'payload' in event) {
    const payload = (event as { payload?: unknown }).payload;
    if (payload && typeof payload === 'object' && field in payload) {
      return (payload as Record<string, unknown>)[field];
    }
  }
  return undefined;
}

function normalizeConversationHistory(messages: unknown): EditorAiConversationMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.flatMap((message): EditorAiConversationMessage[] => {
    if (!message || typeof message !== 'object') {
      return [];
    }

    const value = message as Record<string, unknown>;
    const role = value.role;
    const content = typeof value.content === 'string' ? value.content.trim() : '';
    if ((role !== 'user' && role !== 'assistant') || content.length === 0) {
      return [];
    }

    return [{ role, content }];
  });
}

function hasConversationContext(conversation: readonly EditorAiConversationMessage[] | undefined): boolean {
  return (conversation ?? []).some((message) => message.content.trim().length > 0);
}

export class EditorAiService {
  private abortController: AbortController | null = null;
  private static runtimeConfig: EditorAiRuntimeConfig | null = null;
  private readonly http: HttpClient;

  constructor(
    private readonly getToken: () => string | null,
    private readonly onAuthExpired?: () => void,
    httpClient?: HttpClient,
  ) {
    this.http = httpClient ?? resolveHttpClient(getToken);
  }

  static async fetchConfig(
    token: string | null,
    httpClient = resolveHttpClient(() => token),
  ): Promise<EditorAiRuntimeConfig> {
    if (EditorAiService.runtimeConfig) {
      return EditorAiService.runtimeConfig;
    }
    try {
      const { data, response } = await httpClient.json<EditorAiRuntimeConfig>('/api/proxy/ai/config', {
        auth: Boolean(token),
      });
      if (response.ok) {
        EditorAiService.runtimeConfig = data;
        configureSemanticTargetDefinitions(data.semanticTargets);
        return data;
      }
    } catch {
      // 继续回退到浏览器安全的默认配置。
    }
    const fallbackConfig = { provider: 'openai', model: 'gpt-5.4' };
    configureSemanticTargetDefinitions(undefined);
    return fallbackConfig;
  }

  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  async loadConversation(templateId: string): Promise<EditorAiConversationMessage[]> {
    const token = this.getToken();
    if (!token) {
      return [];
    }

    const { data, response } = await this.http.json<{ messages?: unknown }>(
      `/api/proxy/ai/editor-conversations/${encodeURIComponent(templateId)}`,
      { auth: true },
    );
    if (!response.ok) {
      return [];
    }

    return normalizeConversationHistory(data.messages);
  }

  async saveConversation(templateId: string, conversation: readonly EditorAiConversationMessage[]): Promise<void> {
    const token = this.getToken();
    if (!token) {
      return;
    }

    const { data, response } = await this.http.json<{ message?: string }>(
      `/api/proxy/ai/editor-conversations/${encodeURIComponent(templateId)}`,
      {
        method: 'PUT',
        auth: true,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ messages: conversation }),
      },
    );
    if (!response.ok) {
      throw new Error(data.message ?? `Failed to save conversation (${response.status})`);
    }
  }

  async fetchCacheStats(): Promise<EditorAiCacheStats | null> {
    const token = this.getToken();
    if (!token) {
      return null;
    }

    const { data, response } = await this.http.json<EditorAiCacheStats>('/api/proxy/ai/cache-stats', { auth: true });
    if (response.status === 401) {
      this.onAuthExpired?.();
      return null;
    }
    if (!response.ok) {
      return null;
    }
    return data;
  }

  async editCanvas(opts: EditorAiEditCanvasOptions): Promise<void> {
    const runtimeConfig = await EditorAiService.fetchConfig(this.getToken(), this.http);
    const {
      prompt,
      model = runtimeConfig.model,
      document,
      pages,
      conversation,
      conversationId,
      selectedNode,
      selectedDescriptor,
      clarificationChoice,
      onEvent,
      applyInstructions,
      signal,
    } = opts;

    const cancelOnAbort = () => {
      this.cancel();
    };
    if (signal?.aborted) {
      cancelOnAbort();
      onEvent({ type: 'done', data: '' });
      return;
    }
    signal?.addEventListener('abort', cancelOnAbort, { once: true });

    try {
      const token = this.getToken();
      if (!token) {
        onEvent({ type: 'error', data: c.unauthenticated, terminal: true });
        onEvent({ type: 'done', data: '' });
        return;
      }

      const abortController = new AbortController();
      this.abortController = abortController;
      const headers: Record<string, string> = {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      };
      if (conversationId) {
        headers['x-conversation-id'] = conversationId;
      }

      const { response, events } = await this.http.stream('/api/proxy/ai/editor', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          prompt,
          document,
          pages,
          conversation: hasConversationContext(conversation) ? conversation : [],
          selectedNode,
          selectedDescriptor,
          clarificationChoice,
        }),
        signal: abortController.signal,
      });

      if (response.status === 401) {
        this.onAuthExpired?.();
        onEvent({ type: 'error', data: c.authExpired, terminal: true });
        onEvent({ type: 'done', data: '' });
        return;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        let message = text || `HTTP ${String(response.status)}`;
        try {
          const parsed = JSON.parse(text) as { message?: unknown };
          if (typeof parsed.message === 'string' && parsed.message) {
            message = parsed.message;
          }
        } catch {
          /* 使用原始文本 */
        }
        throw new Error(message);
      }

      await this.consumeEditorEventStream(
        events,
        onEvent,
        applyInstructions,
        {
          userPrompt: prompt,
          selectedNodeId: selectedNode?.id ?? null,
        },
        opts.getCurrentDocument,
        opts.onSnapshot,
      );
    } catch (err) {
      if (!signal?.aborted) {
        onEvent({
          type: 'error',
          data: err instanceof Error ? err.message : String(err),
          terminal: true,
        });
      }
    } finally {
      this.abortController = null;
      signal?.removeEventListener('abort', cancelOnAbort);
    }
  }

  private async consumeEditorEventStream(
    events: AsyncIterable<HttpStreamEvent>,
    onEvent: (event: EditorAiEvent) => void,
    applyInstructions: EditorAiEditCanvasOptions['applyInstructions'],
    applyOptions: ApplyEditorAiEditInstructionsOptions,
    getCurrentDocument: () => ThemeLayoutDocument,
    onSnapshot: EditorAiEditCanvasOptions['onSnapshot'],
  ): Promise<void> {
    for await (const streamEvent of events) {
      const event = JSON.parse(streamEvent.data) as BackendEditorEvent;
      // Phase 1 envelope 格式: { schema: 'sse.v1', type, ts, payload }
      if (event.schema === 'sse.v1') {
        switch (event.type) {
          case 'text_delta':
            onEvent({ type: 'text', data: eventDataToString(getPayloadField(event, 'text')) });
            break;
          case 'tool_start':
            onEvent({ type: 'tool_start', data: getToolEventName(getPayloadField(event, 'name')) });
            break;
          case 'tool_done':
            onEvent({ type: 'tool_done', data: getToolEventName(getPayloadField(event, 'name')) });
            break;
          case 'tool_error':
            onEvent({ type: 'error', data: eventDataToString(getPayloadField(event, 'error')) });
            break;
          case 'clarification':
            onEvent({
              type: 'clarification',
              data: eventDataToString({
                question: getPayloadField(event, 'question'),
                options: getPayloadField(event, 'options'),
              }),
            });
            break;
          case 'edit_request':
            this.applyBackendEditRequest(
              getPayloadField(event, 'data'),
              onEvent,
              applyInstructions,
              applyOptions,
              getCurrentDocument,
              onSnapshot,
            );
            break;
          case 'error':
            onEvent({
              type: 'error',
              data: eventDataToString(getPayloadField(event, 'message')),
              terminal: true,
            });
            break;
          case 'done':
            onEvent({ type: 'done', data: '' });
            return;
          case 'reasoning_delta': {
            const payload = event.payload as { delta?: unknown } | undefined;
            const delta = typeof payload?.delta === 'string' ? payload.delta : '';
            onEvent({ type: 'reasoning', data: delta });
            break;
          }
          case 'usage_summary': {
            const payload = event.payload as
              | {
                  model?: unknown;
                  usage?: unknown;
                  totalCostUsd?: unknown;
                }
              | undefined;
            const model = typeof payload?.model === 'string' ? payload.model : '';
            const usage = (payload?.usage ?? {}) as {
              inputTokens?: number;
              outputTokens?: number;
              cacheHitTokens?: number;
              cacheMissTokens?: number;
            };
            const totalCostUsd = typeof payload?.totalCostUsd === 'number' ? payload.totalCostUsd : undefined;
            onEvent({
              type: 'usage_summary',
              data: JSON.stringify({
                model,
                usage: {
                  inputTokens: usage.inputTokens ?? 0,
                  outputTokens: usage.outputTokens ?? 0,
                  cacheHitTokens: usage.cacheHitTokens,
                  cacheMissTokens: usage.cacheMissTokens,
                },
                totalCostUsd,
              }),
            });
            break;
          }
          case 'cache_diagnostic': {
            // 缓存诊断 (P0 可观测性): 携带 prefix hash + cache hit rate.
            // 透传为 JSON, 面板侧负责展示; 非终止事件.
            const payload = event.payload as
              | {
                  prefixHash?: unknown;
                  cacheHitRate?: unknown;
                  compactionStrategy?: unknown;
                  prefixChanged?: unknown;
                }
              | undefined;
            onEvent({
              type: 'cache_diagnostic',
              data: JSON.stringify({
                prefixHash: typeof payload?.prefixHash === 'string' ? payload.prefixHash : '',
                cacheHitRate: typeof payload?.cacheHitRate === 'number' ? payload.cacheHitRate : null,
                compactionStrategy:
                  payload?.compactionStrategy === 'skip' ||
                  payload?.compactionStrategy === 'micro' ||
                  payload?.compactionStrategy === 'full'
                    ? payload.compactionStrategy
                    : null,
                prefixChanged: Boolean(payload?.prefixChanged),
              }),
            });
            break;
          }
          // 跳过其他未识别的 envelope 事件
          default:
            break;
        }
        continue;
      }
      // 兼容未带 envelope 的旧事件 (理论上不应该再出现, 但保留 fallback)
      switch (event.type) {
        case 'text':
          onEvent({ type: 'text', data: eventDataToString(event.data) });
          break;
        case 'tool_start':
          onEvent({ type: 'tool_start', data: getToolEventName(event.data) });
          break;
        case 'tool_done':
          onEvent({ type: 'tool_done', data: getToolEventName(event.data) });
          break;
        case 'clarification':
          onEvent({ type: 'clarification', data: eventDataToString(event.data) });
          break;
        case 'edit_request':
          this.applyBackendEditRequest(
            event.data,
            onEvent,
            applyInstructions,
            applyOptions,
            getCurrentDocument,
            onSnapshot,
          );
          break;
        case 'tool_error':
          onEvent({ type: 'error', data: eventDataToString(event.data) });
          break;
        case 'error':
          onEvent({ type: 'error', data: eventDataToString(event.data), terminal: true });
          break;
        case 'done':
          onEvent({ type: 'done', data: '' });
          return;
        default:
          break;
      }
    }
  }

  private applyBackendEditRequest(
    data: unknown,
    onEvent: (event: EditorAiEvent) => void,
    applyInstructions: EditorAiEditCanvasOptions['applyInstructions'],
    applyOptions: ApplyEditorAiEditInstructionsOptions,
    getCurrentDocument: () => ThemeLayoutDocument,
    onSnapshot: EditorAiEditCanvasOptions['onSnapshot'],
  ): void {
    const args =
      typeof data === 'string'
        ? (JSON.parse(data) as { operations?: unknown; reason?: unknown })
        : (data as { operations?: unknown; reason?: unknown });
    const instructions = Array.isArray(args.operations) ? (args.operations as readonly EditorAiEditInstruction[]) : [];
    const reason = typeof args.reason === 'string' ? args.reason : undefined;
    // B.2: 在 apply 前压栈 undo 快照, 以便 UI 提供撤销
    if (onSnapshot) {
      const currentDoc = getCurrentDocument();
      onSnapshot({
        id: `undo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        document: structuredClone(currentDoc),
        description: reason ?? 'AI 编辑',
        createdAt: new Date().toISOString(),
      });
    }
    const result = applyInstructions(instructions, {
      ...applyOptions,
      reason,
    });
    onEvent({
      type: 'edit_applied',
      data: JSON.stringify({
        success: result.errors.length === 0,
        applied: result.applied,
        errors: result.errors,
        selectedNodeId: result.selectedNodeId,
        reason,
      }),
    });
  }
}
