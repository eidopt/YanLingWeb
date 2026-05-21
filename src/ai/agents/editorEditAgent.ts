import type { AIProvider, ProviderMessage } from '../core/providers/types';
import { QueryLoop } from '../core/query-loop';
import { formatUiIntentPlanForPrompt, planUiIntent } from '../planning/ui-intent-router';
import {
  EDITOR_EDIT_TOOL_NAMES,
  editorToolCallToOperations,
  selectEditorEditTools,
} from '../tools/editor-edit.tool';
import { AgentEventRecorder } from './agentEventRecorder';
import {
  buildConversationContextMessages,
  buildEditorStablePrefixContext,
  buildEditorVolatileContext,
} from '@shared/agent/context/editorContext';
import type {
  ApplyEditorAiEditInstructionsOptions,
  ApplyEditorAiEditInstructionsResult,
  EditorAiEditInstruction,
} from '@shared/agent/editor/applyEditorInstructions';
import {
  applyEditorAiEditInstructions,
} from '@shared/agent/editor/applyEditorInstructions';
import { EDITOR_COPILOT_SYSTEM_PROMPT } from '@shared/agent/prompts/editorCopilotPrompt';
import type {
  AgentConversationMessage,
  AgentEvalScenario,
  AgentPageContext,
  AgentRunResult,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from '@shared/agent/types';
import { evaluateSemanticAssertions } from '@shared/agent/validation/semanticAssertions';
import { evaluateUnrelatedDiff } from '@shared/agent/validation/templateDiff';
import {
  renderSmokeThemeLayoutDocument,
  validateThemeLayoutDocument,
} from '@shared/agent/validation/themeLayoutValidator';

export interface EditorEditAgentOptions {
  provider: AIProvider;
  model: string;
  maxIterations?: number;
  isCancelled?: () => boolean;
  onEvent?: (event: ReturnType<AgentEventRecorder['event']>) => void;
  editApplier?: (
    document: ThemeLayoutDocument,
    instructions: readonly EditorAiEditInstruction[],
    options?: ApplyEditorAiEditInstructionsOptions,
  ) => ApplyEditorAiEditInstructionsResult;
}

export interface EditorEditRunInput {
  prompt: string;
  document: ThemeLayoutDocument;
  pages?: AgentPageContext[];
  selectedNode?: ThemeLayoutNode | null;
  selectedDescriptor?: ThemeComponentDescriptor | null;
  conversation?: AgentConversationMessage[];
  scenario?: AgentEvalScenario;
  scenarioId?: string;
}

function parseOperations(operations: unknown): EditorAiEditInstruction[] {
  if (!Array.isArray(operations)) {
    throw new Error('editor tool requires one operation');
  }
  return operations.map((operation) => {
    if (!operation || typeof operation !== 'object') {
      throw new Error('Each editor operation must be an object');
    }
    return operation as EditorAiEditInstruction;
  });
}

export class EditorEditAgent {
  constructor(private readonly options: EditorEditAgentOptions) {}

  async run(input: EditorEditRunInput): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const recorder = new AgentEventRecorder();
    const emit = (type: Parameters<AgentEventRecorder['event']>[0], data?: unknown) => {
      const event = recorder.event(type, data);
      this.options.onEvent?.(event);
    };
    const intentPlan = planUiIntent(input.prompt);
    emit('intent_plan', intentPlan);

    let currentDocument = structuredClone(input.document);
    let terminalError = '';
    const conversationMessages = buildConversationContextMessages(input.conversation);
    const turnContext = [
      'Current turn context:',
      '',
      formatUiIntentPlanForPrompt(intentPlan),
      '',
      buildEditorVolatileContext(
        currentDocument,
        input.pages,
        input.selectedNode,
        input.selectedDescriptor,
      ),
      '',
      'User request:',
      input.prompt,
    ].join('\n');
    const messages: ProviderMessage[] = [
      { role: 'system', content: EDITOR_COPILOT_SYSTEM_PROMPT },
      { role: 'system', content: buildEditorStablePrefixContext(currentDocument.components) },
      ...conversationMessages,
      { role: 'user', content: turnContext },
    ];

    const editorTools = selectEditorEditTools(input.prompt);
    const loop = new QueryLoop({
      provider: this.options.provider,
      model: this.options.model,
      tools: editorTools,
      toolSpecs: new Map(editorTools.map((tool) => [tool.name, { name: tool.name }])),
      maxIterations: this.options.maxIterations ?? 8,
      isCancelled: () => this.options.isCancelled?.() ?? false,
      onTextDelta: (text) => emit('text', text),
      onToolEvent: (event) => {
        emit(event.status === 'error' ? 'tool_error' : event.status === 'start' ? 'tool_start' : 'tool_done', event);
      },
      onError: (message) => {
        terminalError = message;
        emit('error', message);
      },
      toolExecutor: (name, args) => {
        const call = recorder.toolCall(name, args);
        if (!EDITOR_EDIT_TOOL_NAMES.has(name)) {
          call.error = `Unknown tool: ${name}`;
          return Promise.resolve({ output: JSON.stringify({ error: call.error }) });
        }
        try {
          const edit = editorToolCallToOperations(name, args);
          const operations = parseOperations(edit.operations);
          const reason = edit.reason;
          const result = (this.options.editApplier ?? applyEditorAiEditInstructions)(
            currentDocument,
            operations,
            {
              userPrompt: input.prompt,
              reason,
              selectedNodeId: input.selectedNode?.id ?? null,
            },
          );
          currentDocument = result.document;
          const payload = {
            success: result.errors.length === 0,
            applied: result.applied,
            errors: result.errors,
            selectedNodeId: result.selectedNodeId,
            reason,
          };
          call.result = payload;
          emit('edit_applied', payload);
          return Promise.resolve({
            output: JSON.stringify(payload),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          call.error = message;
          emit('error', message);
          return Promise.resolve({ output: JSON.stringify({ error: message }) });
        }
      },
    });

    const loopResult = await loop.run(messages);
    if (loopResult.stopReason === 'error' && loopResult.error) {
      terminalError = loopResult.error;
    }
    emit('done');

    const validation = validateThemeLayoutDocument(currentDocument);
    const semantic = evaluateSemanticAssertions(currentDocument, input.document, input.scenario?.expected);
    const unrelatedDiff = evaluateUnrelatedDiff(input.document, currentDocument, input.scenario?.expected);
    const render = renderSmokeThemeLayoutDocument(currentDocument);
    const calledExpectedTool = recorder.toolCalls.some((call) => EDITOR_EDIT_TOOL_NAMES.has(call.name));
    const passed = !terminalError && calledExpectedTool && validation.valid && semantic.passed && unrelatedDiff.passed
      && render.passed;

    return {
      scenarioId: input.scenarioId ?? input.scenario?.id,
      mode: 'editor_edit',
      prompt: input.prompt,
      status: passed ? 'passed' : terminalError ? 'errored' : 'failed',
      events: recorder.events,
      toolCalls: recorder.toolCalls,
      initialDocument: input.document,
      finalDocument: currentDocument,
      validation,
      semantic,
      unrelatedDiff,
      render,
      durationMs: Date.now() - startedAt,
      error: terminalError || undefined,
    };
  }
}
