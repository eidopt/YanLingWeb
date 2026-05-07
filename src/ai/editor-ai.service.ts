import { BackendProxyProvider } from './core/providers/backend-proxy.provider';
import type { ProviderMessage, ProviderTool } from './core/providers/types';
import { QueryLoop } from './core/query-loop';
import { formatUiIntentPlanForPrompt, planUiIntent } from './planning/ui-intent-router';
import { APPLY_EDITOR_EDITS_TOOL } from './tools/editor-edit.tool';
import type {
  ApplyEditorAiEditInstructionsResult,
  EditorAiEditInstruction,
} from 'ui/editor/services/aiEditInstructions';
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
}

export interface EditorAiEditCanvasOptions {
  prompt: string;
  model?: string;
  document: ThemeLayoutDocument;
  selectedNode?: ThemeLayoutNode | null;
  selectedDescriptor?: ThemeComponentDescriptor | null;
  onEvent: (event: EditorAiEvent) => void;
  applyInstructions: (
    instructions: readonly EditorAiEditInstruction[],
  ) => ApplyEditorAiEditInstructionsResult;
  signal?: AbortSignal;
}

interface ApplyEditorEditsToolInput {
  operations?: unknown;
  reason?: unknown;
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
  '- Prefer the selected node when the user asks to edit "this", "当前", or "选中".',
  '- Do not delete or move the root screen node.',
  '- If a requested capability is not supported by layoutDocument, apply the closest',
  '  editable approximation and explain the limitation after the tool call.',
  '- Prefer one apply_editor_edits call with a small batch of operations.',
].join('\n');

const MAX_NODE_SUMMARY_COUNT = 80;

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

function buildEditorContext(
  document: ThemeLayoutDocument,
  selectedNode: ThemeLayoutNode | null | undefined,
  selectedDescriptor: ThemeComponentDescriptor | null | undefined,
): string {
  return [
    'Current editor context:',
    `themeId: ${document.themeId}`,
    `themeName: ${document.themeName}`,
    `pageName: ${document.pageName ?? document.defaultPageId}`,
    '',
    'Available component catalog:',
    summarizeComponents(document.components),
    '',
    'Selected node:',
    summarizeSelectedNode(selectedNode, selectedDescriptor),
    '',
    'Current canvas outline:',
    summarizeCanvas(document),
  ].join('\n');
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

  constructor(private readonly getToken: () => string | null) {
    this.provider = new BackendProxyProvider(getToken);
  }

  cancel(): void {
    this.provider.cancel();
  }

  async editCanvas(opts: EditorAiEditCanvasOptions): Promise<void> {
    const {
      prompt,
      model = 'gpt-5.4',
      document,
      selectedNode,
      selectedDescriptor,
      onEvent,
      applyInstructions,
      signal,
    } = opts;
    const intentPlan = planUiIntent(prompt);
    const intentPlanPrompt = formatUiIntentPlanForPrompt(intentPlan);

    onEvent({ type: 'intent_plan', data: JSON.stringify(intentPlan) });

    let cancelled = false;
    signal?.addEventListener('abort', () => {
      cancelled = true;
      this.provider.cancel();
    });

    const tools: ProviderTool[] = [APPLY_EDITOR_EDITS_TOOL];
    const messages: ProviderMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: intentPlanPrompt },
      {
        role: 'system',
        content: buildEditorContext(document, selectedNode, selectedDescriptor),
      },
      { role: 'user', content: prompt },
    ];

    const loop = new QueryLoop({
      provider: this.provider,
      model,
      tools,
      toolSpecs: new Map([[
        APPLY_EDITOR_EDITS_TOOL.name,
        { name: APPLY_EDITOR_EDITS_TOOL.name },
      ]]),
      maxIterations: 8,
      isCancelled: () => cancelled,

      onTextDelta: (text) => { onEvent({ type: 'text', data: text }); },

      onToolEvent: (event) => {
        if (event.status === 'start') {
          onEvent({ type: 'tool_start', data: event.name });
        } else if (event.status === 'done') {
          onEvent({ type: 'tool_done', data: event.name });
        }
      },

      onError: (msg) => { onEvent({ type: 'error', data: msg }); },

      toolExecutor: (name, args) => {
        if (name !== APPLY_EDITOR_EDITS_TOOL.name) {
          return Promise.resolve({
            output: JSON.stringify({ error: `Unknown tool: ${name}` }),
          });
        }

        try {
          const operations = parseOperations(args as ApplyEditorEditsToolInput);
          const result = applyInstructions(operations);
          onEvent({
            type: 'edit_applied',
            data: JSON.stringify({
              applied: result.applied,
              errors: result.errors,
              selectedNodeId: result.selectedNodeId,
              reason: typeof args.reason === 'string' ? args.reason : '',
            }),
          });

          return Promise.resolve({
            output: JSON.stringify({
              success: result.errors.length === 0,
              applied: result.applied,
              errors: result.errors,
              selectedNodeId: result.selectedNodeId,
            }),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return Promise.resolve({
            output: JSON.stringify({ error: message }),
          });
        }
      },
    });

    const result = await loop.run(messages);

    if (result.stopReason === 'error') {
      onEvent({ type: 'error', data: result.error ?? 'Unknown error' });
    }
    onEvent({ type: 'done', data: '' });
  }
}
