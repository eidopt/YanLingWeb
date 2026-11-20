import type {
  AgentConversationMessage,
  AgentPageContext,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from '@shared/agent/contracts/agent';
import {
  type AgentTemplateKnowledgeContext,
  buildConversationContextMessages,
  buildEditorMinimalVolatileContext,
  buildEditorStablePrefixContext,
  buildEditorTrimmedVolatileContext,
  compileSemanticEditorInstruction,
  EDITOR_COPILOT_SYSTEM_PROMPT,
  formatUiDesignSkillContextForPrompt,
  inferUiDesignSkillContext,
  isSemanticEditorInstruction,
  type SemanticEditorInstruction,
  summarizeTemplateAgentKnowledge,
  type TemplateProfile,
} from '@shared/agent/runtime';

import { createCacheStrategy } from './core/providers/cacheStrategy';
import type { AIProvider, ProviderRequest, ProviderTool } from './core/providers/types';
import { EDITOR_EDIT_TOOLS } from './tools/editorEdit.tool';

export type StreamRequest = ProviderRequest;

export interface EditorAgentStreamRequest {
  model?: string;
  prompt: string;
  document: ThemeLayoutDocument;
  pages?: AgentPageContext[];
  conversation?: AgentConversationMessage[];
  selectedNode?: ThemeLayoutNode | null;
  selectedDescriptor?: ThemeComponentDescriptor | null;
  clarificationChoice?: unknown;
}

export interface StreamSseEvent {
  data: string;
}

export interface EditorToolInput {
  operations?: unknown;
  reason?: unknown;
}

export interface EditorToolInputWithWarnings extends EditorToolInput {
  warnings?: string[];
}

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface ProviderCacheOptions {
  conversationId?: string;
  previousResponseId?: string;
}

interface ClarificationChoiceRecord {
  value?: unknown;
}

interface RequiredClarificationChoiceRecord {
  value: string;
}

interface OperationTypeRecord {
  type?: unknown;
}

interface SemanticOperationRecord {
  type: string;
}

export interface EditorSseEventPayload {
  type: string;
  data: unknown;
}

export type PipelineStageName = 'designer' | 'critic' | 'schema' | 'verifier';

export interface PipelineStagePayload {
  stage: PipelineStageName;
  attempt: number;
  durationMs?: number;
  status?: 'ok' | 'failed';
  error?: string;
}

export interface SaveGeneratedTemplateResult {
  templateId: string;
  action: 'created' | 'updated';
}

export interface EditorAgentStreamRequestCandidate extends Partial<EditorAgentStreamRequest> {
  messages?: unknown;
}

// 简单内存限流器：每个用户在一个窗口内最多 N 次请求。
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX = 10;
/**
 * 在共享的内存限流 map 上执行限流检查（与原 checkRateLimit 行为一致）。
 */
export function checkRateLimit(rateLimitMap: Map<string, RateLimitEntry>, userId: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    throw new Error(`Rate limit exceeded: max ${RATE_LIMIT_MAX} requests per minute`);
  }
}

export function withRequestScopedCache(
  provider: AIProvider,
  req: StreamRequest,
  cacheOptions?: ProviderCacheOptions,
): StreamRequest {
  const caps = provider.getCapabilities();
  const strategy = createCacheStrategy(caps.cacheStrategy);
  const withRequest = strategy.applyToRequest(req, cacheOptions);
  const withMessages = strategy.applyToMessages(withRequest.messages, cacheOptions);
  return { ...withRequest, messages: withMessages };
}

export function editorToolSpecs(tools: readonly ProviderTool[] = EDITOR_EDIT_TOOLS) {
  return new Map(
    tools.map((tool) => [
      tool.name,
      { name: tool.name, supportsParallel: tool.name === 'editor_search_nodes' },
    ]),
  );
}

export function extractClarificationChoiceText(clarificationChoice: unknown): string {
  return clarificationChoice &&
    typeof clarificationChoice === 'object' &&
    'value' in clarificationChoice &&
    typeof (clarificationChoice as ClarificationChoiceRecord).value === 'string'
    ? (clarificationChoice as RequiredClarificationChoiceRecord).value
    : '';
}

export function compileSemanticEditorOperations(
  edit: EditorToolInput,
  document: ThemeLayoutDocument | undefined,
  profile: TemplateProfile | undefined,
): EditorToolInputWithWarnings {
  if (!Array.isArray(edit.operations) || !document) {
    return edit;
  }

  const operations: unknown[] = [];
  const warnings: string[] = [];
  for (const operation of edit.operations) {
    if (
      operation &&
      typeof operation === 'object' &&
      typeof (operation as OperationTypeRecord).type === 'string' &&
      isSemanticEditorInstruction(operation as SemanticOperationRecord)
    ) {
      const compiled = compileSemanticEditorInstruction(
        document,
        operation as SemanticEditorInstruction,
        profile,
      );
      if (!compiled.success || !compiled.data) {
        throw new Error(JSON.stringify(compiled.error));
      }
      operations.push(...compiled.data.operations);
      warnings.push(...compiled.data.warnings);
      continue;
    }
    operations.push(operation);
  }

  return {
    ...edit,
    operations,
    ...(warnings.length ? { warnings } : {}),
  };
}

export function assertEditorOperations(input: EditorToolInput): void {
  if (!Array.isArray(input.operations)) {
    throw new Error('editor tool requires an operations array');
  }

  for (const operation of input.operations) {
    if (!operation || typeof operation !== 'object') {
      throw new Error('Each editor operation must be an object');
    }
  }
}

export function isEditorAgentStreamRequest(value: unknown): value is EditorAgentStreamRequest {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const input = value as EditorAgentStreamRequestCandidate;
  return (
    typeof input.prompt === 'string' &&
    Boolean(input.document) &&
    typeof input.document === 'object' &&
    !Array.isArray(input.messages)
  );
}

/**
 * 组装结构化编辑器流的稳定上下文、prefix 消息与最终用户消息。
 * 纯函数：所有输入显式传入，行为与原 runStructuredEditorStream 内联逻辑一致。
 */
export function buildStructuredEditorMessages(params: {
  req: EditorAgentStreamRequest;
  prompt: string;
  selectedChoiceText: string;
  providerLog: StreamRequest['messages'];
  templateKnowledge: AgentTemplateKnowledgeContext;
  boundTargetText?: string;
}): {
  prefixMessages: StreamRequest['messages'];
  messages: StreamRequest['messages'];
  effectiveTemplateProfile: TemplateProfile | undefined;
} {
  const { req, prompt, selectedChoiceText, providerLog, templateKnowledge, boundTargetText } =
    params;
  const skillContext = inferUiDesignSkillContext(prompt);
  const fallbackConversation =
    providerLog.length > 0 ? [] : buildConversationContextMessages(req.conversation);
  const templateKnowledgeContext = summarizeTemplateAgentKnowledge(templateKnowledge);
  const stableEditorContext = [
    buildEditorStablePrefixContext(req.document.components),
    templateKnowledgeContext,
  ]
    .filter(Boolean)
    .join('\n\n');
  const effectiveTemplateProfile = templateKnowledge.effectiveProfile
    ? (templateKnowledge.effectiveProfile as TemplateProfile)
    : undefined;
  const prefixMessages: StreamRequest['messages'] = [
    { role: 'system', content: EDITOR_COPILOT_SYSTEM_PROMPT },
    { role: 'system', content: stableEditorContext },
  ];
  const messages: StreamRequest['messages'] = [
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
        selectedChoiceText
          ? buildEditorMinimalVolatileContext(
              req.document,
              req.pages,
              req.selectedNode,
              req.selectedDescriptor,
            )
          : buildEditorTrimmedVolatileContext(
              req.document,
              req.pages,
              req.selectedNode,
              req.selectedDescriptor,
              prompt,
            ),
        selectedChoiceText
          ? ['', 'Confirmed clarification choice:', selectedChoiceText].join('\n')
          : '',
        boundTargetText ? ['', boundTargetText].join('\n') : '',
        '',
        'User request:',
        prompt,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  return { prefixMessages, messages, effectiveTemplateProfile };
}
