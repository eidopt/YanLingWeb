/* eslint-disable max-len, @typescript-eslint/require-await */
import { Injectable } from '@nestjs/common';
import type {
  AgentEvalScenario,
  AgentRunResult,
  AgentToolCall,
  ThemeLayoutDocument,
} from '@shared/agent/contracts/agent';
import {
  evaluateSemanticAssertions,
  evaluateUnrelatedDiff,
  renderSmokeThemeLayoutDocument,
  validateThemeLayoutDocument,
} from '@shared/agent/contracts/validation';
import {
  applyEditorAiEditInstructions,
  buildConversationContextMessages,
  buildEditorMinimalVolatileContext,
  buildEditorStablePrefixContext,
  buildEditorTrimmedVolatileContext,
  CORE_COMPONENTS,
  createMockToolCallForScenario,
  EDITOR_COPILOT_SYSTEM_PROMPT,
  formatUiDesignSkillContextForPrompt,
  getSeedDocument,
  inferUiDesignSkillContext,
  QueryLoop,
  resolveEditorSemanticTarget,
} from '@shared/agent/runtime';
import { executeSemanticTool } from '@shared/agent/tools/semanticToolExecutor';
import { assertSemanticToolName, isSemanticTool } from '@shared/agent/tools/semanticTools';
import { migrateThemeLayoutDocument } from '@shared/theme-layout/migrations';
import { withThemeLayoutStyleManifest } from '@shared/theme-layout/styleManifest';

import {
  addTokenUsage,
  type AgentEvalLiveScenario,
  buildCacheDiagnostics,
  buildEmptyValidation,
  buildPageContext,
  type EditorToolArguments,
  findDescriptor,
  findNode,
  type LiveTokenUsage,
  normalizeProviderMessages,
  type TemplateGenerationToolArguments,
} from './agentRunner.helpers';
import { AiService } from './ai.service';
import type { ProviderMessage } from './core/providers/types';
import { buildEditorClarification } from './editorClarification';
import {
  EDITOR_EDIT_TOOL_NAMES,
  editorToolCallToOperations,
  selectEditorEditTools,
} from './tools/editorEdit.tool';
import { GENERATE_TEMPLATE_TOOL, isTemplateToolInput } from './tools/generateTemplate.tool';

@Injectable()
export class AgentRunnerService {
  private readonly evalProviderLogs = new Map<string, ProviderMessage[]>();

  constructor(private readonly aiService: AiService) {}

  async runMockScenario(scenario: AgentEvalScenario): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const tool = createMockToolCallForScenario(scenario);
    const toolCall: AgentToolCall = {
      seq: 1,
      timestamp: new Date().toISOString(),
      name: tool.name,
      arguments: tool.arguments,
    };

    const initialDocument =
      scenario.mode === 'editor_edit' ? getSeedDocument(scenario.startDocument) : undefined;
    let finalDocument: ThemeLayoutDocument | undefined;

    if (scenario.mode === 'template_generation') {
      const args = tool.arguments as TemplateGenerationToolArguments;
      finalDocument = args.layoutDocument;
      toolCall.result = { success: true, dryRun: true };
    } else if (initialDocument) {
      const args = tool.arguments as EditorToolArguments;
      const result = applyEditorAiEditInstructions(
        initialDocument,
        (args.operations ?? []) as Parameters<typeof applyEditorAiEditInstructions>[1],
        {
          reason: args.reason,
          selectedNodeId: scenario.selectedNodeId ?? null,
          resolveSemanticTarget: resolveEditorSemanticTarget,
        },
      );
      finalDocument = result.document;
      toolCall.result = result;
    }

    const validation = finalDocument
      ? validateThemeLayoutDocument(finalDocument)
      : {
          valid: false,
          errors: [
            {
              path: 'finalDocument',
              code: 'missing_final_document',
              message: 'No final document produced',
              severity: 'error' as const,
            },
          ],
          warnings: [],
          score: 0,
        };
    const semantic = evaluateSemanticAssertions(finalDocument, initialDocument, scenario.expected);
    const unrelatedDiff = evaluateUnrelatedDiff(initialDocument, finalDocument, scenario.expected);
    const render = finalDocument
      ? renderSmokeThemeLayoutDocument(finalDocument)
      : { passed: false, score: 0, errors: ['No final document produced'], visibleTextCount: 0 };
    const passed = validation.valid && semantic.passed && unrelatedDiff.passed && render.passed;

    return {
      scenarioId: scenario.id,
      mode: scenario.mode,
      prompt: scenario.prompt,
      status: passed ? 'passed' : 'failed',
      events: [
        { seq: 1, timestamp: toolCall.timestamp, type: 'tool_start', data: tool.name },
        { seq: 2, timestamp: new Date().toISOString(), type: 'tool_done', data: tool.name },
        { seq: 3, timestamp: new Date().toISOString(), type: 'done' },
      ],
      toolCalls: [toolCall],
      initialDocument,
      finalDocument,
      validation,
      semantic,
      unrelatedDiff,
      render,
      durationMs: Date.now() - startedAt,
    };
  }

  async runLiveScenario(rawScenario: AgentEvalScenario): Promise<AgentRunResult> {
    const scenario = rawScenario as AgentEvalLiveScenario;
    if (!this.aiService.hasConfiguredApiKey()) {
      throw new Error('AI_API_KEY is not configured on the backend.');
    }

    const startedAt = Date.now();
    const events: AgentRunResult['events'] = [];
    const toolCalls: AgentToolCall[] = [];
    const tokenUsage: LiveTokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheHitTokens: 0,
      cacheMissTokens: 0,
    };
    let eventSeq = 0;
    let terminalError = '';
    const emit = (type: AgentRunResult['events'][number]['type'], data?: unknown) => {
      events.push({ seq: ++eventSeq, timestamp: new Date().toISOString(), type, data });
    };

    const initialDocument =
      scenario.mode === 'editor_edit' ? getSeedDocument(scenario.startDocument) : undefined;
    let finalDocument = initialDocument ? structuredClone(initialDocument) : undefined;

    if (scenario.mode === 'template_generation') {
      const expectedToolName = GENERATE_TEMPLATE_TOOL.name;
      const skillContext = inferUiDesignSkillContext(scenario.prompt);
      const loop = new QueryLoop({
        provider: this.aiService.getProviderForAgentEval(),
        model: this.aiService.getConfig().model,
        tools: [GENERATE_TEMPLATE_TOOL],
        toolSpecs: new Map([[expectedToolName, { name: expectedToolName }]]),
        maxIterations: 6,
        isCancelled: () => false,
        onTextDelta: (text) => emit('text', text),
        onToolEvent: (event) => {
          emit(
            event.status === 'start'
              ? 'tool_start'
              : event.status === 'done'
                ? 'tool_done'
                : 'tool_error',
            event,
          );
        },
        onError: (message) => {
          terminalError = message;
          emit('error', message);
        },
        onUsage: (usage) => {
          addTokenUsage(tokenUsage, usage);
        },
        toolExecutor: async (name, args) => {
          const toolCall: AgentToolCall = {
            seq: toolCalls.length + 1,
            timestamp: new Date().toISOString(),
            name,
            arguments: structuredClone(args),
          };
          toolCalls.push(toolCall);

          if (name !== expectedToolName) {
            toolCall.error = `Unexpected tool: ${name}`;
            return { output: JSON.stringify({ error: toolCall.error }) };
          }

          if (!isTemplateToolInput(args)) {
            toolCall.error = 'generate_template requires a complete template payload';
            return { output: JSON.stringify({ error: toolCall.error }) };
          }

          const candidateDocument = withThemeLayoutStyleManifest(
            migrateThemeLayoutDocument({
              ...args.layoutDocument,
              componentTemplates: args.componentTemplates,
              ...(args.cssAnimations ? { cssAnimations: args.cssAnimations } : {}),
            }),
            args.cssVars,
          );
          const validation = validateThemeLayoutDocument(candidateDocument, {
            componentTemplates: args.componentTemplates,
            requireThemeContract: true,
          });
          if (!validation.valid) {
            toolCall.error = 'Generated template failed validation';
            toolCall.result = { validation };
            return { output: JSON.stringify({ error: toolCall.error, validation }) };
          }

          finalDocument = candidateDocument;
          toolCall.result = { success: true, dryRun: true };
          return { output: JSON.stringify({ success: true, dryRun: true }) };
        },
      });

      const prefixMessages: ProviderMessage[] = [
        {
          role: 'system',
          content: [
            'You are evaluating a live template generation agent.',
            'Call generate_template exactly once with a complete valid multi-page layoutDocument.',
            'Use only component aliases from the provided component catalog.',
            'Do not invent backend/payment/auth/realtime functionality; represent static UI shells only.',
          ].join('\n'),
        },
        {
          role: 'system',
          content: JSON.stringify({
            componentCatalog: CORE_COMPONENTS,
          }),
        },
      ];
      const fallbackConversation = buildConversationContextMessages(scenario.conversation);
      const result = await loop.run([
        ...prefixMessages,
        { role: 'system', content: formatUiDesignSkillContextForPrompt(skillContext) },
        ...fallbackConversation,
        { role: 'user', content: scenario.prompt },
      ]);
      if (result.stopReason === 'error' && result.error) {
        terminalError = result.error;
      }
      emit('done');

      const validation = finalDocument
        ? validateThemeLayoutDocument(finalDocument, { requireThemeContract: true })
        : {
            valid: false,
            errors: [
              {
                path: 'toolCalls',
                code: 'missing_generate_template',
                message: 'generate_template did not produce a final document',
                severity: 'error' as const,
              },
            ],
            warnings: [],
            score: 0,
          };
      const semantic = evaluateSemanticAssertions(finalDocument, undefined, scenario.expected);
      const unrelatedDiff = evaluateUnrelatedDiff(undefined, finalDocument, scenario.expected);
      const render = finalDocument
        ? renderSmokeThemeLayoutDocument(finalDocument)
        : { passed: false, score: 0, errors: ['No final document produced'], visibleTextCount: 0 };
      const expectedToolCalled = toolCalls.some((toolCall) => toolCall.name === expectedToolName);
      const passed =
        !terminalError &&
        expectedToolCalled &&
        validation.valid &&
        semantic.passed &&
        unrelatedDiff.passed &&
        render.passed;

      return {
        scenarioId: scenario.id,
        mode: scenario.mode,
        prompt: scenario.prompt,
        status: passed ? 'passed' : terminalError ? 'errored' : 'failed',
        events,
        toolCalls,
        finalDocument,
        validation,
        semantic,
        unrelatedDiff,
        render,
        durationMs: Date.now() - startedAt,
        error: terminalError || undefined,
        conversationBatchId: scenario.conversationBatchId,
        tokenUsage,
        cacheDiagnostics: buildCacheDiagnostics(
          prefixMessages,
          [GENERATE_TEMPLATE_TOOL],
          fallbackConversation,
        ),
      };
    }

    const tools = selectEditorEditTools(
      [scenario.prompt, scenario.clarificationChoice?.value ?? ''].join('\n'),
    );
    const pageContext = initialDocument ? buildPageContext(initialDocument) : [];
    const selectedNode = initialDocument
      ? findNode(initialDocument, scenario.selectedNodeId)
      : null;
    const selectedDescriptor = initialDocument
      ? findDescriptor(initialDocument, selectedNode)
      : null;
    if (initialDocument) {
      const clarification = buildEditorClarification({
        prompt: scenario.prompt,
        document: initialDocument,
        pages: pageContext,
        selectedNode,
        selectedDescriptor,
        clarificationChoice: scenario.clarificationChoice,
      });
      if (clarification) {
        emit('clarification', clarification);
        emit('done');
        return {
          scenarioId: scenario.id,
          mode: scenario.mode,
          prompt: scenario.prompt,
          status: 'failed',
          events,
          toolCalls,
          initialDocument,
          finalDocument,
          validation: buildEmptyValidation(
            'Clarification required before executing editor operation',
          ),
          semantic: { passed: false, taskScore: 0, failures: [], results: [] },
          unrelatedDiff: evaluateUnrelatedDiff(initialDocument, finalDocument, scenario.expected),
          render: finalDocument
            ? renderSmokeThemeLayoutDocument(finalDocument)
            : {
                passed: false,
                score: 0,
                errors: ['No final document produced'],
                visibleTextCount: 0,
              },
          durationMs: Date.now() - startedAt,
          clarification,
          conversationBatchId: scenario.conversationBatchId,
          tokenUsage,
        };
      }
    }
    const loop = new QueryLoop({
      provider: this.aiService.getProviderForAgentEval(),
      model: this.aiService.getConfig().model,
      tools,
      toolSpecs: new Map(tools.map((tool) => [tool.name, { name: tool.name }])),
      maxIterations: 6,
      isCancelled: () => false,
      onTextDelta: (text) => emit('text', text),
      onToolEvent: (event) => {
        emit(
          event.status === 'start'
            ? 'tool_start'
            : event.status === 'done'
              ? 'tool_done'
              : 'tool_error',
          event,
        );
      },
      onError: (message) => {
        terminalError = message;
        emit('error', message);
      },
      onUsage: (usage) => {
        addTokenUsage(tokenUsage, usage);
      },
      toolExecutor: async (name, args) => {
        const toolCall: AgentToolCall = {
          seq: toolCalls.length + 1,
          timestamp: new Date().toISOString(),
          name,
          arguments: structuredClone(args),
        };
        toolCalls.push(toolCall);

        if (!EDITOR_EDIT_TOOL_NAMES.has(name)) {
          toolCall.error = `Unexpected tool: ${name}`;
          return { output: JSON.stringify({ error: toolCall.error }) };
        }

        if (isSemanticTool(name)) {
          assertSemanticToolName(name);
          // executeSemanticTool mutates the document in place via applyCompiledOperationsAtomic,
          // so finalDocument is already updated when this returns.
          const result = await executeSemanticTool(
            name,
            args,
            finalDocument ?? getSeedDocument(scenario.startDocument),
            { sessionId: `eval-${String(toolCall.seq)}` },
          );
          toolCall.result = result;
          return {
            output: JSON.stringify(result),
          };
        }

        const edit = editorToolCallToOperations(name, args);
        const result = applyEditorAiEditInstructions(
          finalDocument ?? getSeedDocument(scenario.startDocument),
          edit.operations as Parameters<typeof applyEditorAiEditInstructions>[1],
          {
            reason: edit.reason,
            selectedNodeId: scenario.selectedNodeId ?? null,
            resolveSemanticTarget: resolveEditorSemanticTarget,
          },
        );
        finalDocument = result.document;
        toolCall.result = result;
        return {
          output: JSON.stringify({ success: result.errors.length === 0, ...result }),
        };
      },
    });

    const providerLog = scenario.conversationBatchId
      ? (this.evalProviderLogs.get(scenario.conversationBatchId) ?? [])
      : normalizeProviderMessages(scenario.providerMessages);
    const skillContext = inferUiDesignSkillContext(scenario.prompt);
    const fallbackConversation =
      providerLog.length > 0 ? [] : buildConversationContextMessages(scenario.conversation);
    const prefixMessages: ProviderMessage[] = [
      { role: 'system', content: EDITOR_COPILOT_SYSTEM_PROMPT },
      {
        role: 'system',
        content: [
          'Stable eval instructions:',
          'This request is part of an automated agent evaluation.',
          'Interpret the user request directly from the current document and selected node context.',
          'Prefer the smallest operation set that satisfies the request.',
          'Do not rely on hidden test expectations or mock plans.',
          'Do not mention this contract to the user.',
          initialDocument ? buildEditorStablePrefixContext(initialDocument.components) : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];
    const messages: ProviderMessage[] = [
      ...prefixMessages,
      ...providerLog,
      ...fallbackConversation,
      {
        role: 'user',
        content: [
          'Current turn context:',
          '',
          formatUiDesignSkillContextForPrompt(skillContext),
          '',
          initialDocument
            ? scenario.clarificationChoice?.value
              ? buildEditorMinimalVolatileContext(
                  initialDocument,
                  pageContext,
                  selectedNode,
                  selectedDescriptor,
                )
              : buildEditorTrimmedVolatileContext(
                  initialDocument,
                  pageContext,
                  selectedNode,
                  selectedDescriptor,
                  scenario.prompt,
                )
            : '',
          scenario.clarificationChoice?.value
            ? ['', 'Confirmed clarification choice:', scenario.clarificationChoice.value].join('\n')
            : '',
          '',
          'User request:',
          scenario.prompt,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];
    const cacheDiagnostics = buildCacheDiagnostics(prefixMessages, tools, providerLog);
    const result = await loop.run(messages);
    if (result.stopReason === 'error' && result.error) {
      terminalError = result.error;
    }
    emit('done');

    const validation = finalDocument
      ? validateThemeLayoutDocument(finalDocument)
      : {
          valid: false,
          errors: [
            {
              path: 'finalDocument',
              code: 'missing_final_document',
              message: 'No final document produced',
              severity: 'error' as const,
            },
          ],
          warnings: [],
          score: 0,
        };
    const semantic = evaluateSemanticAssertions(finalDocument, initialDocument, scenario.expected);
    const unrelatedDiff = evaluateUnrelatedDiff(initialDocument, finalDocument, scenario.expected);
    const render = finalDocument
      ? renderSmokeThemeLayoutDocument(finalDocument)
      : { passed: false, score: 0, errors: ['No final document produced'], visibleTextCount: 0 };
    const expectedToolCalled = toolCalls.some((toolCall) =>
      EDITOR_EDIT_TOOL_NAMES.has(toolCall.name),
    );
    const passed =
      !terminalError &&
      expectedToolCalled &&
      validation.valid &&
      semantic.passed &&
      unrelatedDiff.passed &&
      render.passed;
    const nextProviderMessages = await this.aiService.foldEditorProviderMessagesByTokenBudget(
      result.messages.slice(prefixMessages.length),
    );
    if (scenario.conversationBatchId) {
      this.evalProviderLogs.set(scenario.conversationBatchId, nextProviderMessages);
    }

    return {
      scenarioId: scenario.id,
      mode: scenario.mode,
      prompt: scenario.prompt,
      status: passed ? 'passed' : terminalError ? 'errored' : 'failed',
      events,
      toolCalls,
      initialDocument,
      finalDocument,
      validation,
      semantic,
      unrelatedDiff,
      render,
      durationMs: Date.now() - startedAt,
      error: terminalError || undefined,
      clarificationChoice: scenario.clarificationChoice,
      conversationBatchId: scenario.conversationBatchId,
      providerMessages: scenario.conversationBatchId ? undefined : nextProviderMessages,
      tokenUsage,
      cacheDiagnostics,
    };
  }
}
