import type { AgentClarificationOption } from '@shared/agent/types';
import type {
  ApplyEditorAiEditInstructionsOptions,
  ApplyEditorAiEditInstructionsResult,
  EditorAiEditInstruction,
} from 'ui/editor/services/aiEditInstructions';
import {
  configureSemanticTargetDefinitions,
  type SemanticTargetDefinitionConfig,
} from 'ui/editor/services/semanticTargets';
import type {
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from 'ui/layout/types';

export interface EditorAiEvent {
  type:
    | 'text'
    | 'intent_plan'
    | 'tool_start'
    | 'tool_done'
    | 'edit_applied'
    | 'clarification'
    | 'error'
    | 'done';
  data: string;
  terminal?: boolean;
}

export interface EditorAiEditCanvasOptions {
  prompt: string;
  model?: string;
  document: ThemeLayoutDocument;
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
  semanticTargets?: SemanticTargetDefinitionConfig[];
}

interface BackendEditorEvent {
  type: string;
  data?: unknown;
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

function normalizeConversationHistory(
  messages: unknown,
): EditorAiConversationMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.flatMap((message): EditorAiConversationMessage[] => {
    if (!message || typeof message !== 'object') {
      return [];
    }

    const value = message as Record<string, unknown>;
    const role = value.role;
    const content = typeof value.content === 'string'
      ? value.content.trim()
      : '';
    if (
      (role !== 'user' && role !== 'assistant')
      || content.length === 0
    ) {
      return [];
    }

    return [{ role, content }];
  });
}

function hasConversationContext(
  conversation: readonly EditorAiConversationMessage[] | undefined,
): boolean {
  return (conversation ?? []).some((message) => message.content.trim().length > 0);
}

export class EditorAiService {
  private abortController: AbortController | null = null;
  private static runtimeConfig: EditorAiRuntimeConfig | null = null;

  constructor(
    private readonly getToken: () => string | null,
    private readonly onAuthExpired?: () => void,
  ) {}

  static async fetchConfig(token: string | null): Promise<EditorAiRuntimeConfig> {
    if (EditorAiService.runtimeConfig) {
      return EditorAiService.runtimeConfig;
    }
    try {
      const res = await fetch('/api/proxy/ai/config', {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const config = await res.json() as EditorAiRuntimeConfig;
        EditorAiService.runtimeConfig = config;
        configureSemanticTargetDefinitions(config.semanticTargets);
        return config;
      }
    } catch {
      // Fall through to the browser-safe default.
    }
    const fallbackConfig = { provider: 'openai', model: 'gpt-5.4' };
    configureSemanticTargetDefinitions(undefined);
    return fallbackConfig;
  }

  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  async loadConversation(
    templateId: string,
  ): Promise<EditorAiConversationMessage[]> {
    const token = this.getToken();
    if (!token) {
      return [];
    }

    const res = await fetch(
      `/api/proxy/ai/editor-conversations/${encodeURIComponent(templateId)}`,
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      return [];
    }

    const data = await res.json().catch(() => ({})) as { messages?: unknown };
    return normalizeConversationHistory(data.messages);
  }

  async saveConversation(
    templateId: string,
    conversation: readonly EditorAiConversationMessage[],
  ): Promise<void> {
    const token = this.getToken();
    if (!token) {
      return;
    }

    await fetch(
      `/api/proxy/ai/editor-conversations/${encodeURIComponent(templateId)}`,
      {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ messages: conversation }),
      },
    );
  }

  async editCanvas(opts: EditorAiEditCanvasOptions): Promise<void> {
    const runtimeConfig = await EditorAiService.fetchConfig(this.getToken());
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
        onEvent({ type: 'error', data: '未登录，请先登录后再使用 AI 功能', terminal: true });
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

      const res = await fetch('/api/ai/editor', {
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

      if (res.status === 401) {
        this.onAuthExpired?.();
        onEvent({ type: 'error', data: '登录已过期，请重新登录。', terminal: true });
        onEvent({ type: 'done', data: '' });
        return;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${String(res.status)}`);
      }

      await this.consumeEditorEventStream(res, onEvent, applyInstructions, {
        userPrompt: prompt,
        selectedNodeId: selectedNode?.id ?? null,
      });
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
    res: Response,
    onEvent: (event: EditorAiEvent) => void,
    applyInstructions: EditorAiEditCanvasOptions['applyInstructions'],
    applyOptions: ApplyEditorAiEditInstructionsOptions,
  ): Promise<void> {
    if (!res.body) {
      throw new Error('Empty AI editor response body');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) { break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) { continue; }
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') { continue; }

          const event = JSON.parse(raw) as BackendEditorEvent;
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
    } finally {
      reader.releaseLock();
    }
  }

  private applyBackendEditRequest(
    data: unknown,
    onEvent: (event: EditorAiEvent) => void,
    applyInstructions: EditorAiEditCanvasOptions['applyInstructions'],
    applyOptions: ApplyEditorAiEditInstructionsOptions,
  ): void {
    const args = typeof data === 'string'
      ? JSON.parse(data) as { operations?: unknown; reason?: unknown }
      : data as { operations?: unknown; reason?: unknown };
    const instructions = Array.isArray(args.operations)
      ? args.operations as readonly EditorAiEditInstruction[]
      : [];
    const reason = typeof args.reason === 'string' ? args.reason : undefined;
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
