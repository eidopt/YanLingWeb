import { resolveSemanticTargetNodeId } from '../../ui/editor/services/semanticTargets';
import { autoCompactIfNeeded, createAutoCompactState } from '../core/compact/autoCompact';
import type { AIProvider, ProviderMessage } from '../core/providers/types';
import { formatUiIntentPlanForPrompt, planUiIntent } from '../planning/uiIntentRouter';
import {
  EDITOR_EDIT_TOOL_NAMES,
  editorToolCallToOperations,
  runEditorSearchTool,
  selectEditorEditTools,
} from '../tools/editorEdit.tool';
import { AgentEventRecorder } from './agentEventRecorder';
import {
  applyEditorAiEditInstructions,
  type ApplyEditorAiEditInstructionsOptions,
  type ApplyEditorAiEditInstructionsResult,
  buildConversationContextMessages,
  buildEditorStablePrefixContext,
  buildEditorVolatileContext,
  EDITOR_COPILOT_SYSTEM_PROMPT,
  type EditorAiEditInstruction,
  firstMissingExistingNode,
  formatUiDesignSkillContextForPrompt,
  inferUiDesignSkillContext,
  QueryLoop,
} from '@shared/agent/browser';
import type {
  AgentConversationMessage,
  AgentEvalScenario,
  AgentPageContext,
  AgentRunResult,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from '@shared/agent/contracts/agent';
import {
  evaluateSemanticAssertions,
  evaluateUnrelatedDiff,
  renderSmokeThemeLayoutDocument,
  validateThemeLayoutDocument,
} from '@shared/agent/contracts/validation';
import { executeSemanticTool } from '@shared/agent/tools/semanticToolExecutor';
import { assertSemanticToolName, isSemanticTool } from '@shared/agent/tools/semanticTools';

export interface EditorEditAgentOptions {
  provider: AIProvider;
  model: string;
  compactionModel?: string;
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

function messageContentPreview(message: ProviderMessage): string {
  if (typeof message.content === 'string') {
    return message.content.slice(0, 200);
  }
  return JSON.stringify(message.content).slice(0, 200);
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
    const skillContext = inferUiDesignSkillContext(input.prompt, intentPlan.matchedCategories);
    emit('intent_plan', intentPlan);

    let currentDocument = structuredClone(input.document);
    let terminalError = '';
    const conversationMessages = buildConversationContextMessages(input.conversation);
    const turnContext = [
      'Current turn context:',
      '',
      formatUiIntentPlanForPrompt(intentPlan),
      '',
      formatUiDesignSkillContextForPrompt(skillContext),
      '',
      buildEditorVolatileContext(currentDocument, input.pages, input.selectedNode, input.selectedDescriptor),
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

    // Pre-compact BEFORE the loop starts to ensure prefix stability.
    // Compaction inside the loop would change the message prefix mid-session,
    // breaking DeepSeek's prefix caching for subsequent iterations.
    const preCompactState = createAutoCompactState();
    const compactResult = await autoCompactIfNeeded(messages, this.options.model, preCompactState, {
      provider: this.options.provider,
      compactionModel: this.options.compactionModel,
    });
    if (compactResult.wasCompacted) {
      messages.length = 0;
      messages.push(...compactResult.messages);
    }

    const prefixHash = simpleHash(
      messages
        .slice(0, 2)
        .map((m) => `${m.role}:${messageContentPreview(m)}`)
        .join('|'),
    );
    const conversationDepth = conversationMessages.length;
    console.warn(
      `[Cache] prefix=${prefixHash} conversationDepth=${conversationDepth}` +
        ` compacted=${compactResult.wasCompacted}`,
    );

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
      toolExecutor: async (name, args) => {
        const call = recorder.toolCall(name, args);
        if (!EDITOR_EDIT_TOOL_NAMES.has(name)) {
          call.error = `Unknown tool: ${name}`;
          return Promise.resolve({ output: JSON.stringify({ error: call.error }) });
        }
        const search = runEditorSearchTool(name, args, currentDocument);
        if (search) {
          call.result = JSON.parse(search.output) as unknown;
          return Promise.resolve(search);
        }
        if (isSemanticTool(name)) {
          assertSemanticToolName(name);
          // executeSemanticTool mutates the document in place via applyCompiledOperationsAtomic,
          // so currentDocument is already updated when this returns.
          try {
            const result = await executeSemanticTool(name, args, currentDocument, {
              sessionId: `agent-${Date.now()}`,
            });
            call.result = result;
            emit('edit_applied', {
              success: result.success,
              applied: result.success ? (result.data?.appliedOperations ?? []) : [],
              errors: result.success ? [] : [String(result.error?.code ?? 'unknown')],
            });
            return Promise.resolve({ output: JSON.stringify(result) });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            call.error = message;
            emit('error', message);
            return Promise.resolve({ output: JSON.stringify({ error: message }) });
          }
        }
        try {
          const edit = editorToolCallToOperations(name, args);
          const operations = parseOperations(edit.operations);
          const missing = firstMissingExistingNode(currentDocument, operations);
          if (missing) {
            call.error = missing.error;
            call.result = missing;
            return Promise.resolve({ output: JSON.stringify(missing) });
          }
          const reason = edit.reason;
          // 快照当前文档，若编辑失败则回滚，防止部分成功导致脏状态
          const preEditSnapshot = structuredClone(currentDocument);
          const result = (this.options.editApplier ?? applyEditorAiEditInstructions)(currentDocument, operations, {
            userPrompt: input.prompt,
            reason,
            selectedNodeId: input.selectedNode?.id ?? null,
            resolveSemanticTarget: (document, target, selectedNodeId) =>
              resolveSemanticTargetNodeId(document, { target, selectedNodeId }),
          });
          const isFullSuccess = result.errors.length === 0;
          const hasAppliedOps = result.applied.length > 0;
          const isValidationRollback = result.rollbackReason === 'validation';
          // 全部成功 → 接受变更；部分失败 → 回滚到快照
          if (isFullSuccess || isValidationRollback) {
            currentDocument = result.document;
          } else if (hasAppliedOps) {
            // 部分成功：回滚到快照，避免脏状态污染后续调用
            currentDocument = preEditSnapshot;
          }
          const payload = isFullSuccess
            ? {
                success: true as const,
                applied: result.applied,
                errors: result.errors,
                selectedNodeId: result.selectedNodeId,
                reason,
              }
            : isValidationRollback
              ? {
                  success: false as const,
                  validationFailed: true as const,
                  applied: result.applied,
                  errors: result.errors,
                  hint: [
                    'All instructions executed but the final document failed validation.',
                    'The document was rolled back to the original state.',
                    'Review the validation errors and adjust your edits accordingly.',
                  ].join(' '),
                  reason,
                }
              : hasAppliedOps
                ? {
                    success: false as const,
                    partial: true as const,
                    rolledBack: true as const,
                    applied: result.applied,
                    errors: result.errors,
                    hint: [
                      'Some operations failed. Document was rolled back to before this edit.',
                      'Review the errors and retry with correct node IDs.',
                      'Use only node IDs from the "Editable nodes" list.',
                    ].join(' '),
                    reason,
                  }
                : {
                    success: false as const,
                    errors: result.errors,
                    hint: [
                      'All operations failed.',
                      'Review the errors and retry with correct node IDs from the canvas outline',
                      'or Node ID Quick Reference.',
                      'If unsure about the target, use semanticTarget or ask the user to confirm.',
                    ].join(' '),
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
    const passed =
      !terminalError &&
      calledExpectedTool &&
      validation.valid &&
      semantic.passed &&
      unrelatedDiff.passed &&
      render.passed;

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

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}
