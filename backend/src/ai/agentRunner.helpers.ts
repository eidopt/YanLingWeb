import { createHash } from 'node:crypto';

import type {
  AgentClarificationOption,
  AgentConversationMessage,
  AgentEvalScenario,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from '@shared/agent/contracts/agent';
import { CORE_COMPONENTS } from '@shared/agent/runtime';

import type { ProviderMessage } from './core/providers/types';
import { tokenCountWithEstimation } from './core/utils/tokens';
import type { TemplateToolInput } from './tools/generateTemplate.tool';

export interface LiveTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
}

export interface AgentEvalLiveScenario extends AgentEvalScenario {
  conversation?: AgentConversationMessage[];
  providerMessages?: ProviderMessage[];
  clarificationChoice?: AgentClarificationOption;
  conversationBatchId?: string;
}

export interface TemplateGenerationToolArguments {
  layoutDocument: ThemeLayoutDocument;
}

export interface EditorToolArguments {
  operations?: unknown[];
  reason?: string;
}

export function addTokenUsage(
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

export function normalizeLayout(value: unknown, order = 1): ThemeLayoutNode['layout'] {
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

export function normalizeNodeProps(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('$')));
}

export function normalizeNode(value: unknown, fallbackId: string, order = 1): ThemeLayoutNode {
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

export function _normalizeGeneratedDocument(
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

export function collectNodes(node: ThemeLayoutNode, output: ThemeLayoutNode[]): void {
  output.push(node);
  node.children?.forEach((child) => collectNodes(child, output));
}

export function findNode(
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

export function findDescriptor(
  document: ThemeLayoutDocument,
  node: ThemeLayoutNode | null,
): ThemeComponentDescriptor | null {
  if (!node) {
    return null;
  }
  return document.components.find((component) => component.alias === node.alias) ?? null;
}

export function buildPageContext(document: ThemeLayoutDocument) {
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

export function buildEmptyValidation(message: string) {
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

export function normalizeProviderMessages(messages: unknown): ProviderMessage[] {
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

export function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

export function buildCacheDiagnostics(
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
