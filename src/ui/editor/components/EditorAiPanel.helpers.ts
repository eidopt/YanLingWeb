import type { ThemeLayoutDocument, ThemeLayoutNode } from '../../layout/types';
import { editorAiPanelContent as c } from './EditorAiPanel.content';
import type { AgentClarification } from '@shared/agent/contracts/agent';
import type { EditorAiCacheStats, EditorAiConversationMessage } from 'ai/editor-ai.service';
import type { UiIntentPlan } from 'ai/planning/ui-intent-router';
import { CONTAINER_ALIASES } from 'domain/template';
import { EDITOR_AI_PANEL_MAX_STORED_MESSAGES, type EditorAiPanelMessage } from 'state/editorAiPanelState';

export type EditorAiMessage = EditorAiPanelMessage;

export interface EditAppliedEventPayload {
  applied?: string[];
  errors?: string[];
  reason?: string;
}

interface TraversedNode {
  node: ThemeLayoutNode;
  depth: number;
}

interface MissingNodeReference {
  field: 'nodeId' | 'parentId' | 'targetId';
  requestedId: string;
}

export const CACHE_STATS_REFRESH_INTERVAL_MS = 30_000;

export const INITIAL_MESSAGES: EditorAiMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text: c.initialMessage,
  },
];

export function createMessageId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function buildProviderConversationId(templateId: string): string {
  return `editor-template-${encodeURIComponent(templateId)}`;
}

export function parseIntentPlan(data: string): UiIntentPlan | null {
  try {
    return JSON.parse(data) as UiIntentPlan;
  } catch {
    return null;
  }
}

export function parseEditAppliedPayload(data: string): EditAppliedEventPayload {
  try {
    return JSON.parse(data) as EditAppliedEventPayload;
  } catch {
    return {};
  }
}

export function parseClarification(data: string): AgentClarification | null {
  try {
    const parsed = JSON.parse(data) as AgentClarification;
    return Array.isArray(parsed.options) && parsed.options.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function describeAppliedEdits(payload: EditAppliedEventPayload) {
  const applied = payload.applied ?? [];
  const errors = payload.errors ?? [];

  if (!applied.length && !errors.length) {
    return c.noExecutableEdits;
  }

  const appliedText = applied.length ? `${c.appliedPrefix}${applied.join(c.listDelimiter)}` : '';
  const errorText = errors.length ? `${c.incompletePrefix}${errors.join(c.errorDelimiter)}` : '';

  return [payload.reason, appliedText, errorText].filter(Boolean).join('\n');
}

function flattenDocumentNodes(node: ThemeLayoutNode, output: TraversedNode[] = [], depth = 0): TraversedNode[] {
  output.push({ node, depth });
  node.children?.forEach((child) => flattenDocumentNodes(child, output, depth + 1));
  return output;
}

function getNodeStringProp(node: ThemeLayoutNode, propName: string) {
  const value = node.props?.[propName];
  return typeof value === 'string' ? value.trim() : '';
}

function truncateLabel(value: string, maxLength = 18) {
  const trimmed = value.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}...` : trimmed;
}

function aliasDisplayName(alias: string) {
  const normalized = alias.replace(/^core\./, '');
  const names: Record<string, string> = c.aliasDisplayNames;
  return names[normalized] ?? normalized;
}

function getNodeDisplayText(node: ThemeLayoutNode) {
  return (
    getNodeStringProp(node, 'title') ||
    getNodeStringProp(node, 'label') ||
    getNodeStringProp(node, 'text') ||
    getNodeStringProp(node, 'placeholder') ||
    getNodeStringProp(node, 'activeTab') ||
    getNodeStringProp(node, 'actionLabel') ||
    ''
  );
}

function describeNodeOption(item: TraversedNode) {
  const text = getNodeDisplayText(item.node);
  const typeLabel = aliasDisplayName(item.node.alias);
  const prefix = item.depth === 0 ? c.nodeOption.pagePrefix : `${typeLabel}`;
  return text ? `${prefix}：${truncateLabel(text)}` : `${prefix} ${item.depth + 1}`;
}

function describeNodeDetails(item: TraversedNode) {
  const text = getNodeDisplayText(item.node);
  return [
    `${aliasDisplayName(item.node.alias)}${c.nodeOption.componentSuffix}`,
    text ? `${c.nodeOption.contentPrefix}${truncateLabel(text, 36)}` : '',
    `${c.nodeOption.depthPrefix}${item.depth + 1}`,
    `${c.nodeOption.nodeIdPrefix}${item.node.id}`,
  ]
    .filter(Boolean)
    .join(c.nodeOption.separator);
}

function normalizeNodeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function scoreNodeIdSimilarity(requestedId: string, nodeId: string) {
  const requested = normalizeNodeId(requestedId);
  const existing = normalizeNodeId(nodeId);
  if (!requested || !existing) {
    return 0;
  }
  if (requested === existing) {
    return 1;
  }
  if (requested.length >= 4 && existing.length >= 4 && (requested.includes(existing) || existing.includes(requested))) {
    return 0.9;
  }

  const requestedParts = requestedId
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter(Boolean);
  const existingParts = nodeId
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter(Boolean);
  if (!requestedParts.length || !existingParts.length) {
    return 0;
  }
  const existingSet = new Set(existingParts);
  const overlap = requestedParts.filter((part) => existingSet.has(part)).length;
  return overlap / Math.max(requestedParts.length, existingParts.length);
}

function parseMissingNodeReference(errors: readonly string[]): MissingNodeReference | null {
  for (const error of errors) {
    const explicit = /(nodeId|parentId|targetId)[：:]\s*([A-Za-z0-9_.:-]+)/.exec(error);
    if (explicit) {
      return {
        field: explicit[1] as MissingNodeReference['field'],
        requestedId: explicit[2],
      };
    }

    const notFound = /Node not found:\s*([A-Za-z0-9_.:-]+)/.exec(error);
    if (notFound) {
      return { field: 'nodeId', requestedId: notFound[1] };
    }
  }
  return null;
}

export function buildApplyFailureClarification(
  payload: EditAppliedEventPayload,
  document: ThemeLayoutDocument,
): AgentClarification | null {
  const missing = parseMissingNodeReference(payload.errors ?? []);
  if (!missing) {
    return null;
  }

  const nodes = flattenDocumentNodes(document.layout);
  const targetNodes =
    missing.field === 'parentId' ? nodes.filter(({ node }) => CONTAINER_ALIASES.has(node.alias)) : nodes;
  const ranked = targetNodes
    .map((item) => ({
      item,
      score: scoreNodeIdSimilarity(missing.requestedId, item.node.id),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.item.depth - right.item.depth;
    })
    .slice(0, 6);

  if (!ranked.length) {
    return null;
  }

  return {
    reason: `AI referenced missing ${missing.field}: ${missing.requestedId}`,
    question: [
      c.clarification.missingReferenceQuestion(missing.field, missing.requestedId),
      c.clarification.chooseExistingNode,
    ].join('\n'),
    options: ranked.map(({ item }) => ({
      id: `${missing.field}-${item.node.id}`,
      label: describeNodeOption(item),
      description: describeNodeDetails(item),
      value: [
        `Use existing node id "${item.node.id}" as the confirmed`,
        `replacement for missing ${missing.field} "${missing.requestedId}".`,
      ].join(' '),
      target: {
        nodeId: item.node.id,
        alias: item.node.alias,
      },
    })),
    allowCustom: true,
    customLabel: c.clarification.customLabel,
    customPlaceholder: c.clarification.customPlaceholder,
  };
}

function hasEditStatusText(paragraph: string): boolean {
  return (
    paragraph.includes(c.appliedPrefix) ||
    paragraph.includes(c.incompletePrefix) ||
    paragraph.includes(c.noExecutableEdits)
  );
}

export function replaceLatestEditStatus(text: string, statusText: string): string {
  const stableParagraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !hasEditStatusText(paragraph));

  return [...stableParagraphs, statusText.trim()].filter(Boolean).join('\n\n');
}

export function hasStreamingMessages(messages: readonly EditorAiMessage[]): boolean {
  return messages.some((message) => message.streaming);
}

export function buildMessagesFromConversation(conversation: readonly EditorAiConversationMessage[]): EditorAiMessage[] {
  return conversation.slice(-EDITOR_AI_PANEL_MAX_STORED_MESSAGES).map((message, index) => ({
    id: `history-${index}-${message.role}`,
    role: message.role,
    text: message.content,
  }));
}

function formatTokenCount(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return String(value);
}

export function buildCacheStatsBadges(stats: EditorAiCacheStats | null): string[] {
  if (!stats || stats.totalRequests === 0) {
    return [c.cache.unavailable];
  }

  return [
    c.cache.hitRate(stats.overallCacheHitRate),
    c.cache.hitTokens(formatTokenCount(stats.totalCacheHitTokens)),
    c.cache.recentRequests(stats.recentRequests.length),
  ];
}
