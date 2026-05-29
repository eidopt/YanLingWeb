/* eslint-disable max-len, @typescript-eslint/require-await */
import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type {
  AgentClarificationOption,
  AgentConversationMessage,
  AgentEvalScenario,
  AgentRunResult,
  AgentToolCall,
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
import { migrateThemeLayoutDocument } from '@shared/theme-layout/migrations';
import { withThemeLayoutStyleManifest } from '@shared/theme-layout/styleManifest';

import { AiService } from './ai.service';
import type { ProviderMessage } from './core/providers/types';
import { tokenCountWithEstimation } from './core/utils/tokens';
import { buildEditorClarification } from './editor-clarification';
import {
  EDITOR_EDIT_TOOL_NAMES,
  editorToolCallToOperations,
  selectEditorEditTools,
} from './tools/editor-edit.tool';
import {
  GENERATE_TEMPLATE_TOOL,
  isTemplateToolInput,
  type TemplateToolInput,
} from './tools/generate-template.tool';

interface LiveTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
}

interface AgentEvalLiveScenario extends AgentEvalScenario {
  conversation?: AgentConversationMessage[];
  providerMessages?: ProviderMessage[];
  clarificationChoice?: AgentClarificationOption;
  conversationBatchId?: string;
}

interface TemplateGenerationToolArguments {
  layoutDocument: ThemeLayoutDocument;
}

interface EditorToolArguments {
  operations?: unknown[];
  reason?: string;
}

function addTokenUsage(
  target: LiveTokenUsage,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheHitTokens?: number;
    cacheMissTokens?: number;
  },
): void {
  target.inputTokens += usage.inputTokens;
  target.outputTokens += usage.outputTokens;
  target.cacheHitTokens += usage.cacheHitTokens ?? 0;
  target.cacheMissTokens += usage.cacheMissTokens ?? 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeLayout(value: unknown, order = 1): ThemeLayoutNode['layout'] {
  const input = isRecord(value) ? value : {};
  const mode = input.mode === 'grid' || input.mode === 'absolute' ? input.mode : 'flow';
  const width =
    typeof input.width === 'string' || typeof input.width === 'number' ? input.width : '100%';
  return {
    mode,
    width,
    ...(typeof input.order === 'number' ? { order: input.order } : { order }),
  };
}

function normalizeNodeProps(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('$')));
}

function normalizeNode(value: unknown, fallbackId: string, order = 1): ThemeLayoutNode {
  const input = isRecord(value) ? value : {};
  const alias = stringValue(input.alias, 'core.text');
  const children = Array.isArray(input.children)
    ? input.children.map((child, index) =>
        normalizeNode(child, `${fallbackId}-${index + 1}`, index + 1),
      )
    : undefined;
  return {
    id: stringValue(input.id, fallbackId),
    alias,
    slot: input.slot === 'body' || input.slot === 'footer' ? input.slot : undefined,
    layout: normalizeLayout(input.layout, order),
    props: normalizeNodeProps(input.props),
    interactions: isRecord(input.interactions) ? input.interactions : undefined,
    ...(children?.length ? { children } : {}),
  };
}

function _normalizeGeneratedDocument(
  rawDocument: unknown,
  input: TemplateToolInput,
  scenario: AgentEvalScenario,
): ThemeLayoutDocument {
  const raw = isRecord(rawDocument) ? rawDocument : {};
  const domain = scenario.mock?.templateDomain ?? input.name;
  const rawPages = Array.isArray(raw.pages) ? raw.pages : [];
  const pages =
    rawPages.length > 0
      ? rawPages.map((pageValue, index) => {
          const page = isRecord(pageValue) ? pageValue : {};
          const pageId = stringValue(page.id, `page-${index + 1}`);
          const pageName = stringValue(
            page.name,
            stringValue(page.alias, index === 0 ? '首页' : `页面${index + 1}`),
          );
          const pageLayout =
            isRecord(page.layout) && typeof page.layout.alias === 'string'
              ? normalizeNode(page.layout, `${pageId}-screen`)
              : {
                  id: stringValue(page.rootNodeId, `${pageId}-screen`),
                  alias: 'core.screen',
                  layout: normalizeLayout(isRecord(page.layout) ? page.layout : undefined),
                  props: isRecord(page.props) ? page.props : { title: pageName },
                  children: Array.isArray(page.children)
                    ? page.children.map((child, childIndex) =>
                        normalizeNode(child, `${pageId}-node-${childIndex + 1}`, childIndex + 1),
                      )
                    : [
                        {
                          id: `${pageId}-title`,
                          alias: 'core.text',
                          layout: { mode: 'flow' as const, order: 1, width: '100%' },
                          props: { text: `${domain}${pageName}`, variant: 'heading' },
                        },
                      ],
                };
          if (pageLayout.alias !== 'core.screen') {
            pageLayout.alias = 'core.screen';
          }
          return { id: pageId, name: pageName, layout: pageLayout };
        })
      : [];

  if (pages.length > 0) {
    const firstPage = pages[0];
    const firstLayout = firstPage.layout;
    const containsStartCta = JSON.stringify(pages).includes('立即开始');
    if (!containsStartCta) {
      firstLayout.children ??= [];
      firstLayout.children.push({
        id: `${firstPage.id}-start-button`,
        alias: 'core.button',
        layout: { mode: 'flow', order: firstLayout.children.length + 1, width: '100%' },
        props: { label: '立即开始', variant: 'primary' },
      });
    }
  }

  const fallbackPageId = pages.length > 0 ? pages[0].id : 'page-1';
  const defaultPageId = stringValue(raw.defaultPageId, fallbackPageId);
  const fallbackLayout =
    pages.length > 0
      ? pages[0].layout
      : {
          id: 'page-1-screen',
          alias: 'core.screen' as const,
          layout: { mode: 'flow' as const, width: '100%' },
          props: { title: domain },
        };
  const defaultLayout = pages.find((page) => page.id === defaultPageId)?.layout ?? fallbackLayout;
  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    themeId: stringValue(raw.themeId, stringValue(input.templateId, `eval-${scenario.id}`)),
    themeName: stringValue(raw.themeName, stringValue(input.name, `${domain}应用`)),
    pageName: stringValue(raw.pageName, pages[0]?.name ?? '首页'),
    description: stringValue(
      raw.description,
      stringValue(input.description, `${domain}多页面应用`),
    ),
    components:
      Array.isArray(raw.components) && raw.components.length > 0
        ? (raw.components as ThemeLayoutDocument['components'])
        : CORE_COMPONENTS,
    defaultPageId,
    pages,
    layout: defaultLayout,
    dependencies: Array.isArray(raw.dependencies)
      ? (raw.dependencies as ThemeLayoutDocument['dependencies'])
      : undefined,
    componentTemplates: isRecord(input.componentTemplates) ? input.componentTemplates : undefined,
    cssVars: isRecord(input.cssVars) ? input.cssVars : undefined,
  };
}

function collectNodes(node: ThemeLayoutNode, output: ThemeLayoutNode[]): void {
  output.push(node);
  node.children?.forEach((child) => collectNodes(child, output));
}

function findNode(
  document: ThemeLayoutDocument,
  nodeId: string | null | undefined,
): ThemeLayoutNode | null {
  if (!nodeId) {
    return null;
  }
  for (const page of document.pages) {
    const nodes: ThemeLayoutNode[] = [];
    collectNodes(page.layout, nodes);
    const found = nodes.find((node) => node.id === nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

function findDescriptor(
  document: ThemeLayoutDocument,
  node: ThemeLayoutNode | null,
): ThemeComponentDescriptor | null {
  if (!node) {
    return null;
  }
  return document.components.find((component) => component.alias === node.alias) ?? null;
}

function buildPageContext(document: ThemeLayoutDocument) {
  return document.pages.map((page) => {
    const nodes: ThemeLayoutNode[] = [];
    collectNodes(page.layout, nodes);
    return {
      pageId: page.id,
      name: page.name,
      rootNodeId: page.layout.id,
      isActive: page.id === document.defaultPageId,
      nodeCount: nodes.length,
      bodyNodeCount: nodes.filter((node) => node.slot !== 'footer').length,
      footerNodeCount: nodes.filter((node) => node.slot === 'footer').length,
      isBlank: nodes.length <= 1,
    };
  });
}

function buildEmptyValidation(message: string) {
  return {
    valid: false,
    errors: [
      {
        path: 'toolCalls',
        code: 'clarification_required',
        message,
        severity: 'warning' as const,
      },
    ],
    warnings: [],
    score: 0,
  };
}

function normalizeProviderMessages(messages: unknown): ProviderMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.flatMap((message): ProviderMessage[] => {
    if (!message || typeof message !== 'object') {
      return [];
    }
    const value = message as Partial<ProviderMessage>;
    if (
      value.role !== 'user' &&
      value.role !== 'assistant' &&
      value.role !== 'tool_call' &&
      value.role !== 'tool_result'
    ) {
      return [];
    }
    return [
      {
        role: value.role,
        content: typeof value.content === 'string' ? value.content : '',
        ...(typeof value.toolCallId === 'string' ? { toolCallId: value.toolCallId } : {}),
        ...(typeof value.toolName === 'string' ? { toolName: value.toolName } : {}),
        ...(typeof value.toolArguments === 'string' ? { toolArguments: value.toolArguments } : {}),
        ...(typeof value.reasoningContent === 'string'
          ? { reasoningContent: value.reasoningContent }
          : {}),
      },
    ];
  });
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

function buildCacheDiagnostics(
  prefixMessages: readonly ProviderMessage[],
  tools: readonly unknown[],
  providerLog: readonly ProviderMessage[] = [],
) {
  return {
    prefixHash: hashJson(prefixMessages),
    toolHash: hashJson(tools),
    firstDynamicMessageIndex: prefixMessages.length,
    prefixMessageCount: prefixMessages.length,
    prefixTokenEstimate: tokenCountWithEstimation(prefixMessages),
    providerLogMessageCount: providerLog.length,
    toolCount: tools.length,
  };
}

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
        ? validateThemeLayoutDocument(finalDocument)
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
