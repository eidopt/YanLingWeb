import { BackendProxyProvider } from './core/providers/backend-proxy.provider';
import type { ProviderMessage } from './core/providers/types';
import { QueryLoop } from './core/query-loop';
import { formatUiIntentPlanForPrompt, planUiIntent } from './planning/ui-intent-router';
import { APPLY_EDITOR_EDITS_TOOL } from './tools/editor-edit.tool';
import type {
  ApplyEditorAiEditInstructionsOptions,
  ApplyEditorAiEditInstructionsResult,
  EditorAiEditInstruction,
} from 'ui/editor/services/aiEditInstructions';
import {
  configureSemanticTargetDefinitions,
  formatSemanticTargetContext,
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

interface ApplyEditorEditsToolInput {
  operations?: unknown;
  reason?: unknown;
}

interface EditorAiRuntimeConfig {
  provider: string;
  model: string;
  semanticTargets?: SemanticTargetDefinitionConfig[];
}

const SYSTEM_PROMPT = [
  'You are an AI editing copilot inside a visual UI editor.',
  '',
  'Your job is to update the currently open canvas with local, auditable edits.',
  'Use apply_editor_edits for UI changes. Do not regenerate the whole template.',
  '',
  'Rules:',
  '- Use Chinese for user-facing text.',
  '- Preserve the user\'s existing manual edits unless the request clearly replaces them.',
  '- Use only aliases listed in the current component catalog.',
  '- Use node ids exactly as provided in the current canvas outline.',
  '- When the user describes a region semantically, first check Semantic',
  '  target glossary and Detected semantic landmarks. Use the real nodeId from',
  '  those landmarks. Do not invent ids such as commerce-me-footer.',
  '- If you cannot confidently choose a real nodeId but the intent matches a',
  '  semantic role, set semanticTarget to that role instead of inventing nodeId.',
  '- Only nodes listed in the current canvas outline already exist. The',
  '  component catalog also includes library aliases that may be inserted later;',
  '  do not invent node ids from those aliases.',
  '- Existing backend static templates are rendered as concrete core.* nodes.',
  '  Edit visible text by updating the exact node props from the canvas outline',
  '  such as core.text.text, core.button.label, core.tag.label,',
  '  core.search.placeholder, core.tabs.activeTab, or core.screen.title.',
  '- To add a new page, use create_page first. Then insert sections under that',
  '  new page rootNodeId. Do not insert core.screen directly.',
  '- To remove an empty or duplicate page, use delete_page with the exact',
  '  pageId from Known editor pages. Do not delete a footer node or root',
  '  screen node when the user asks to delete a page.',
  '- Use pageId only when an operation should target a specific existing page.',
  '  Without pageId, operations after create_page target the newly created page.',
  '- When page navigation should match the page list, use',
  '  sync_page_navigation. For bottom tabs, set semanticTarget to',
  '  page_footer_nav. This updates every page navigation target from Known',
  '  editor pages and removes stale tabs.',
  '- For a one-page footer edit, set props.tabs and props.activeTab on',
  '  core.tabs. Use update_interactions with onTabClick label-to-navigate maps',
  '  when explicit navigation wiring is needed.',
  '- Only these aliases can receive child nodes: core.screen, core.panel,',
  '  core.stack, core.row, core.grid. Other aliases are leaf nodes; update their',
  '  props instead of inserting inside them.',
  '- When inserting next to a node, set parentId to that node\'s real parent',
  '  container and targetId to the sibling node id.',
  '- Prefer the selected node when the user asks to edit "this", "当前", or "选中".',
  '- Do not delete or move the root screen node.',
  '',
  'core.widget — for inserting dynamic third-party content:',
  '  Only use core.widget when the required dependency already appears in',
  '  Loaded dependencies, or when the user explicitly asks for custom code.',
  '  The editor edit tool cannot add layoutDocument.dependencies. Do not claim',
  '  that you added dependencies unless they already exist in the document.',
  '',
  '- If a requested capability is not supported by layoutDocument, prefer a',
  '  static approximation using supported core.* components unless widget',
  '  runtime is explicitly enabled and the dependency already exists.',
  '- Prefer one apply_editor_edits call with a small batch of operations.',
].join('\n');

const MAX_NODE_SUMMARY_COUNT = 80;
const MAX_CONVERSATION_CONTEXT_MESSAGES = 12;
const MAX_CONVERSATION_MESSAGE_CHARS = 4000;

const CONVERSATION_CONTEXT_PROMPT = [
  'Conversation history from this editor chat follows.',
  'Use it for prior user intent, references such as "that" or "continue",',
  'and agreed decisions. The Current editor context above is authoritative',
  'for node ids, page ids, props, and the latest canvas state. If history',
  'conflicts with the current editor context, follow the current editor context.',
].join('\n');

function stringifyPropValue(value: unknown): string {
  if (value == null) {
    return '';
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stringifyPropValue).filter(Boolean).join(', ')}]`;
  }

  return '{...}';
}

function summarizeProps(props: Record<string, unknown> | undefined): string {
  const entries = Object.entries(props ?? {})
    .slice(0, 6)
    .map(([key, value]) => `${key}=${stringifyPropValue(value)}`)
    .filter((item) => item.length > 0);

  return entries.length ? entries.join(', ') : 'none';
}

function summarizeLayout(node: ThemeLayoutNode): string {
  const parts = [
    `mode=${node.layout.mode}`,
    node.layout.width ? `width=${String(node.layout.width)}` : '',
    typeof node.layout.flowRow === 'number'
      ? `row=${String(node.layout.flowRow)}`
      : '',
    typeof node.layout.order === 'number'
      ? `order=${String(node.layout.order)}`
      : '',
  ].filter(Boolean);

  return parts.join(', ');
}

function appendNodeSummary(
  node: ThemeLayoutNode,
  lines: string[],
  depth = 0,
): void {
  if (lines.length >= MAX_NODE_SUMMARY_COUNT) {
    return;
  }

  const indent = '  '.repeat(depth);
  lines.push(
    `${indent}- ${node.id} | ${node.alias} | ${summarizeLayout(node)}`
      + ` | props: ${summarizeProps(node.props)}`,
  );

  node.children?.forEach((child) => {
    appendNodeSummary(child, lines, depth + 1);
  });
}

function summarizeCanvas(document: ThemeLayoutDocument): string {
  const lines: string[] = [];
  appendNodeSummary(document.layout, lines);
  if (lines.length >= MAX_NODE_SUMMARY_COUNT) {
    lines.push('- ... node summary truncated');
  }
  return lines.join('\n');
}

function summarizeComponents(components: ThemeComponentDescriptor[]): string {
  return components
    .map((component) => {
      const props = component.props
        .map((prop) => {
          const enumValues = prop.enum?.length
            ? `[${prop.enum.join('|')}]`
            : '';
          return `${prop.name}:${prop.type}${enumValues}`;
        })
        .join(', ');
      return `- ${component.alias} (${component.kind}) props: ${props || 'none'}`;
    })
    .join('\n');
}

function summarizeSelectedNode(
  node: ThemeLayoutNode | null | undefined,
  descriptor: ThemeComponentDescriptor | null | undefined,
): string {
  if (!node) {
    return 'none';
  }

  return [
    `id: ${node.id}`,
    `alias: ${node.alias}`,
    `name: ${descriptor?.name ?? node.alias}`,
    `props: ${summarizeProps(node.props)}`,
  ].join('\n');
}

function summarizePages(pages: EditorAiPageContext[] | undefined): string {
  if (!pages?.length) {
    return 'none';
  }

  return pages
    .map((page) => {
      const activeMarker = page.isActive ? ' active' : '';
      const stats = [
        `root=${page.rootNodeId}`,
        typeof page.nodeCount === 'number' ? `nodes=${page.nodeCount}` : '',
        typeof page.bodyNodeCount === 'number'
          ? `body=${page.bodyNodeCount}`
          : '',
        typeof page.footerNodeCount === 'number'
          ? `footer=${page.footerNodeCount}`
          : '',
        page.isBlank ? 'blank' : '',
      ].filter(Boolean).join(', ');
      return `- ${page.pageId}${activeMarker} | ${page.name} | ${stats}`;
    })
    .join('\n');
}

function buildEditorContext(
  document: ThemeLayoutDocument,
  pages: EditorAiPageContext[] | undefined,
  selectedNode: ThemeLayoutNode | null | undefined,
  selectedDescriptor: ThemeComponentDescriptor | null | undefined,
): string {
  const depsSection = document.dependencies?.length
    ? [
        '',
        'Loaded dependencies (available to core.widget):',
        ...document.dependencies.map((dep) => `  - ${dep.name}: ${dep.url}`),
      ].join('\n')
    : '';

  return [
    'Current editor context:',
    `themeId: ${document.themeId}`,
    `themeName: ${document.themeName}`,
    `pageName: ${document.pageName ?? document.defaultPageId}`,
    '',
    'Known editor pages:',
    summarizePages(pages),
    '',
    'Available component catalog:',
    summarizeComponents(document.components),
    depsSection,
    '',
    'Selected node:',
    summarizeSelectedNode(selectedNode, selectedDescriptor),
    '',
    'Semantic targets:',
    formatSemanticTargetContext(document, selectedNode?.id),
    '',
    'Current canvas outline:',
    summarizeCanvas(document),
  ].filter(Boolean).join('\n');
}

function trimConversationContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= MAX_CONVERSATION_MESSAGE_CHARS) {
    return trimmed;
  }

  return `[Earlier content omitted]\n${trimmed.slice(-MAX_CONVERSATION_MESSAGE_CHARS)}`;
}

function buildConversationMessages(
  conversation: readonly EditorAiConversationMessage[] | undefined,
): ProviderMessage[] {
  return (conversation ?? [])
    .filter((message) => (
      message.content.trim().length > 0
    ))
    .slice(-MAX_CONVERSATION_CONTEXT_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: trimConversationContent(message.content),
    }));
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

function parseOperations(
  input: ApplyEditorEditsToolInput,
): EditorAiEditInstruction[] {
  if (!Array.isArray(input.operations)) {
    throw new Error('apply_editor_edits requires an operations array');
  }

  return input.operations.map((operation) => {
    if (!operation || typeof operation !== 'object') {
      throw new Error('每条编辑操作都必须是对象');
    }
    return operation as EditorAiEditInstruction;
  });
}

export class EditorAiService {
  private provider: BackendProxyProvider;
  private static runtimeConfig: EditorAiRuntimeConfig | null = null;

  constructor(
    private readonly getToken: () => string | null,
    private readonly onAuthExpired?: () => void,
  ) {
    this.provider = new BackendProxyProvider(getToken, onAuthExpired);
  }

  /** Fetch AI config from backend and cache runtime prompt configuration. */
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
    } catch { /* fall through */ }
    const fallbackConfig = { provider: 'openai', model: 'gpt-5.4' };
    configureSemanticTargetDefinitions(undefined);
    return fallbackConfig;
  }

  cancel(): void {
    this.provider.cancel();
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
      onEvent,
      applyInstructions,
      signal,
    } = opts;
    const intentPlan = planUiIntent(prompt);
    const intentPlanPrompt = formatUiIntentPlanForPrompt(intentPlan);
    const conversationMessages = buildConversationMessages(conversation);

    if (conversationId) {
      this.provider.setConversationId(conversationId);
    } else if (conversationMessages.length === 0) {
      this.provider.resetConversation();
    }
    onEvent({ type: 'intent_plan', data: JSON.stringify(intentPlan) });

    const messages: ProviderMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: intentPlanPrompt },
      {
        role: 'system',
        content: buildEditorContext(
          document,
          pages,
          selectedNode,
          selectedDescriptor,
        ),
      },
    ];
    if (conversationMessages.length > 0) {
      messages.push(
        { role: 'system', content: CONVERSATION_CONTEXT_PROMPT },
        ...conversationMessages,
      );
    }
    messages.push({ role: 'user', content: prompt });

    const cancelOnAbort = () => {
      this.provider.cancel();
    };
    if (signal?.aborted) {
      cancelOnAbort();
      onEvent({ type: 'done', data: '' });
      return;
    }
    signal?.addEventListener('abort', cancelOnAbort, { once: true });

    try {
      const loop = new QueryLoop({
        provider: this.provider,
        model,
        tools: [APPLY_EDITOR_EDITS_TOOL],
        toolSpecs: new Map([[
          APPLY_EDITOR_EDITS_TOOL.name,
          { name: APPLY_EDITOR_EDITS_TOOL.name },
        ]]),
        maxIterations: 8,
        isCancelled: () => signal?.aborted ?? false,
        onTextDelta: (text) => {
          onEvent({ type: 'text', data: text });
        },
        onToolEvent: (event) => {
          if (event.status === 'start') {
            onEvent({ type: 'tool_start', data: event.name });
            return;
          }
          if (event.status === 'done') {
            onEvent({ type: 'tool_done', data: event.name });
            return;
          }
          onEvent({ type: 'error', data: event.detail ?? event.name });
        },
        onError: (msg) => {
          onEvent({ type: 'error', data: msg, terminal: true });
        },
        toolExecutor: (name, args) => {
          if (name !== APPLY_EDITOR_EDITS_TOOL.name) {
            return Promise.resolve({
              output: JSON.stringify({ error: `Unknown tool: ${name}` }),
            });
          }

          try {
            const operations = parseOperations(args);
            const reason = typeof args.reason === 'string' ? args.reason : '';
            const result = applyInstructions(operations, {
              userPrompt: prompt,
              reason,
              selectedNodeId: selectedNode?.id ?? null,
            });
            const payload = {
              success: result.errors.length === 0,
              applied: result.applied,
              errors: result.errors,
              selectedNodeId: result.selectedNodeId,
              reason,
            };
            onEvent({ type: 'edit_applied', data: JSON.stringify(payload) });
            return Promise.resolve({ output: JSON.stringify(payload) });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            onEvent({ type: 'error', data: message });
            return Promise.resolve({
              output: JSON.stringify({ error: message }),
            });
          }
        },
      });

      const result = await loop.run(messages);
      if (result.stopReason === 'error' && result.error) {
        onEvent({ type: 'error', data: result.error });
      }
    } catch (err) {
      if (!signal?.aborted) {
        onEvent({
          type: 'error',
          data: err instanceof Error ? err.message : String(err),
          terminal: true,
        });
      }
    } finally {
      signal?.removeEventListener('abort', cancelOnAbort);
      onEvent({ type: 'done', data: '' });
    }
  }
}
