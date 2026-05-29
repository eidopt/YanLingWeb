'use client';

import type { ThemeComponentDescriptor, ThemeLayoutDocument, ThemeLayoutNode } from '../../layout/types';
import type {
  ApplyEditorAiEditInstructionsOptions,
  ApplyEditorAiEditInstructionsResult,
  EditorAiEditInstruction,
} from '../services/aiEditInstructions';
import { CONTAINER_ALIASES } from '../services/layoutBuilderService';
import { editorAiPanelContent as c } from './EditorAiPanel.content';
import type { AgentClarification, AgentClarificationOption } from '@shared/agent/contracts/agent';
import type { EditorAiCacheStats, EditorAiConversationMessage, EditorAiPageContext } from 'ai/editor-ai.service';
import type { UiIntentPlan } from 'ai/planning/ui-intent-router';
import { useAppServices } from 'hooks/useAppServices';
import { type FormEvent, useCallback, useEffect, useRef } from 'react';
import {
  buildEditorAiPanelConversationContext,
  buildEditorAiPanelConversationStorageKey,
  buildPersistedEditorAiPanelConversation,
  EDITOR_AI_PANEL_MAX_STORED_MESSAGES,
  type EditorAiPanelMessage,
  editorAiPanelStateActions,
  loadBrowserEditorAiPanelConversationMessages,
  saveBrowserEditorAiPanelConversationMessages,
  useEditorAiPanelSnapshot,
} from 'state/editorAiPanelState';
import { type ChatMessage, ChatPanel } from 'ui/chat/ChatPanel';

interface EditorAiPanelProps {
  templateId?: string;
  currentDocument: ThemeLayoutDocument;
  pages?: EditorAiPageContext[];
  selectedNode: ThemeLayoutNode | null;
  selectedDescriptor: ThemeComponentDescriptor | null;
  disabled?: boolean;
  onApplyInstructions: (
    instructions: readonly EditorAiEditInstruction[],
    options?: ApplyEditorAiEditInstructionsOptions,
  ) => ApplyEditorAiEditInstructionsResult;
}

type EditorAiMessage = EditorAiPanelMessage;

interface EditAppliedEventPayload {
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

const CACHE_STATS_REFRESH_INTERVAL_MS = 30_000;

const INITIAL_MESSAGES: EditorAiMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text: c.initialMessage,
  },
];

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildProviderConversationId(templateId: string): string {
  return `editor-template-${encodeURIComponent(templateId)}`;
}

function parseIntentPlan(data: string): UiIntentPlan | null {
  try {
    return JSON.parse(data) as UiIntentPlan;
  } catch {
    return null;
  }
}

function parseEditAppliedPayload(data: string): EditAppliedEventPayload {
  try {
    return JSON.parse(data) as EditAppliedEventPayload;
  } catch {
    return {};
  }
}

function parseClarification(data: string): AgentClarification | null {
  try {
    const parsed = JSON.parse(data) as AgentClarification;
    return Array.isArray(parsed.options) && parsed.options.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function describeAppliedEdits(payload: EditAppliedEventPayload) {
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

function buildApplyFailureClarification(
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

function replaceLatestEditStatus(text: string, statusText: string): string {
  const stableParagraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !hasEditStatusText(paragraph));

  return [...stableParagraphs, statusText.trim()].filter(Boolean).join('\n\n');
}

function hasStreamingMessages(messages: readonly EditorAiMessage[]): boolean {
  return messages.some((message) => message.streaming);
}

function buildMessagesFromConversation(conversation: readonly EditorAiConversationMessage[]): EditorAiMessage[] {
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

function buildCacheStatsBadges(stats: EditorAiCacheStats | null): string[] {
  if (!stats || stats.totalRequests === 0) {
    return [c.cache.unavailable];
  }

  return [
    c.cache.hitRate(stats.overallCacheHitRate),
    c.cache.hitTokens(formatTokenCount(stats.totalCacheHitTokens)),
    c.cache.recentRequests(stats.recentRequests.length),
  ];
}

export function EditorAiPanel({
  templateId,
  currentDocument,
  pages,
  selectedNode,
  selectedDescriptor,
  disabled = false,
  onApplyInstructions,
}: EditorAiPanelProps) {
  const { editorAiService } = useAppServices();
  const conversationTemplateId = templateId ?? currentDocument.themeId;
  const templateConversationKey = buildEditorAiPanelConversationStorageKey(conversationTemplateId);
  const providerConversationId = buildProviderConversationId(conversationTemplateId);
  const abortRef = useRef<AbortController | null>(null);
  const activeConversationKeyRef = useRef(templateConversationKey);
  const remoteConversationTemplateRef = useRef<string | null>(null);
  const lastRemoteConversationRef = useRef('');
  const saveConversationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextConversationSaveRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const createInitialMessages = useCallback(
    () => loadBrowserEditorAiPanelConversationMessages(templateConversationKey, INITIAL_MESSAGES),
    [templateConversationKey],
  );
  const { messages, prompt, status, isRunning, intentPlan, cacheStats } = useEditorAiPanelSnapshot(
    templateConversationKey,
    createInitialMessages,
    c.status.ready,
  );
  const { resetConversation, setMessages, setPrompt, setStatus, setIsRunning, setIntentPlan, setCacheStats } =
    editorAiPanelStateActions;

  const refreshCacheStats = useCallback(async () => {
    try {
      const nextStats = await editorAiService.fetchCacheStats();
      if (mountedRef.current) {
        setCacheStats(nextStats);
      }
    } catch {
      if (mountedRef.current) {
        setCacheStats(null);
      }
    }
  }, [editorAiService, setCacheStats]);

  function appendMessage(message: EditorAiMessage) {
    setMessages((current) => [...current, message].slice(-EDITOR_AI_PANEL_MAX_STORED_MESSAGES));
  }

  function appendAssistantDelta(messageId: string, text: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, text: `${message.text}${text}`, streaming: true } : message,
      ),
    );
  }

  function replaceAssistantEditStatus(messageId: string, text: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              text: replaceLatestEditStatus(message.text, text),
              streaming: true,
            }
          : message,
      ),
    );
  }

  function setAssistantClarification(messageId: string, clarification: AgentClarification, sourcePrompt: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              text: clarification.question,
              streaming: false,
              clarification: {
                question: clarification.question,
                options: clarification.options,
                allowCustom: clarification.allowCustom,
                customLabel: clarification.customLabel,
                customPlaceholder: clarification.customPlaceholder,
              },
              clarificationPrompt: sourcePrompt,
            }
          : message,
      ),
    );
  }

  function markAssistantComplete(messageId: string) {
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? { ...message, streaming: false } : message)),
    );
  }

  function completeStreamingMessages() {
    setMessages((current) =>
      current.map((message) => (message.streaming ? { ...message, streaming: false } : message)),
    );
  }

  useEffect(() => {
    if (activeConversationKeyRef.current === templateConversationKey) {
      return;
    }

    const controller = abortRef.current;
    abortRef.current = null;
    controller?.abort();
    editorAiService.cancel();
    if (saveConversationTimerRef.current) {
      clearTimeout(saveConversationTimerRef.current);
      saveConversationTimerRef.current = null;
    }
    remoteConversationTemplateRef.current = null;
    lastRemoteConversationRef.current = '';
    activeConversationKeyRef.current = templateConversationKey;
    skipNextConversationSaveRef.current = true;
    resetConversation(
      templateConversationKey,
      loadBrowserEditorAiPanelConversationMessages(templateConversationKey, INITIAL_MESSAGES),
      c.status.ready,
    );
  }, [editorAiService, resetConversation, templateConversationKey]);

  useEffect(() => {
    if (skipNextConversationSaveRef.current) {
      skipNextConversationSaveRef.current = false;
      return;
    }
    if (isRunning || hasStreamingMessages(messages)) {
      return;
    }

    saveBrowserEditorAiPanelConversationMessages(templateConversationKey, messages);
    if (remoteConversationTemplateRef.current !== conversationTemplateId) {
      return;
    }

    const conversation = buildPersistedEditorAiPanelConversation(messages);
    const serialized = JSON.stringify(conversation);
    if (
      serialized === lastRemoteConversationRef.current ||
      (!conversation.length && !lastRemoteConversationRef.current)
    ) {
      return;
    }

    if (saveConversationTimerRef.current) {
      clearTimeout(saveConversationTimerRef.current);
      saveConversationTimerRef.current = null;
    }
    void editorAiService
      .saveConversation(conversationTemplateId, conversation)
      .then(() => {
        lastRemoteConversationRef.current = serialized;
      })
      .catch(() => undefined);
  }, [conversationTemplateId, editorAiService, isRunning, messages, templateConversationKey]);

  useEffect(() => {
    let cancelled = false;
    const templateIdForLoad = conversationTemplateId;
    void editorAiService
      .loadConversation(templateIdForLoad)
      .then((conversation) => {
        if (cancelled || activeConversationKeyRef.current !== templateConversationKey) {
          return;
        }

        const remoteMessages = buildMessagesFromConversation(conversation);
        remoteConversationTemplateRef.current = templateIdForLoad;
        lastRemoteConversationRef.current = JSON.stringify(buildPersistedEditorAiPanelConversation(remoteMessages));
        if (!remoteMessages.length) {
          return;
        }

        setMessages((current) => {
          const currentConversation = buildPersistedEditorAiPanelConversation(current);
          if (currentConversation.length > remoteMessages.length) {
            return current;
          }

          const nextMessages = [...INITIAL_MESSAGES, ...remoteMessages];
          saveBrowserEditorAiPanelConversationMessages(templateConversationKey, nextMessages);
          return nextMessages;
        });
      })
      .catch(() => {
        if (!cancelled) {
          remoteConversationTemplateRef.current = templateIdForLoad;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationTemplateId, editorAiService, setMessages, templateConversationKey]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (saveConversationTimerRef.current) {
        clearTimeout(saveConversationTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const initialRefreshId = window.setTimeout(() => void refreshCacheStats(), 0);
    const intervalId = window.setInterval(() => void refreshCacheStats(), CACHE_STATS_REFRESH_INTERVAL_MS);
    return () => {
      window.clearTimeout(initialRefreshId);
      window.clearInterval(intervalId);
    };
  }, [refreshCacheStats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, status]);

  async function runAssistant(
    trimmedPrompt: string,
    clarificationChoice?: AgentClarificationOption | null,
    displayText = trimmedPrompt,
    autoChoiceDepth = 0,
  ) {
    const assistantMessageId = createMessageId('assistant');
    const abortController = new AbortController();
    const conversation = buildEditorAiPanelConversationContext(messages);
    let finished = false;
    let receivedClarification = false;
    let finalStatus: string = c.status.ready;

    abortRef.current = abortController;
    setIsRunning(true);
    setStatus(c.status.analyzing);
    setIntentPlan(null);
    setPrompt('');
    appendMessage({
      id: createMessageId('user'),
      role: 'user',
      text: displayText,
    });
    appendMessage({
      id: assistantMessageId,
      role: 'assistant',
      text: '',
      streaming: true,
    });

    const finishActiveRun = (nextStatus: string) => {
      if (finished) {
        return;
      }
      finished = true;
      markAssistantComplete(assistantMessageId);
      if (abortRef.current !== abortController) {
        return;
      }
      abortRef.current = null;
      setStatus(nextStatus);
      setIsRunning(false);
      void refreshCacheStats();
    };

    const pauseForClarification = (clarification: AgentClarification) => {
      if (clarification.options.length === 1 && autoChoiceDepth === 0) {
        const [option] = clarification.options;
        receivedClarification = true;
        finalStatus = c.status.ready;
        replaceAssistantEditStatus(assistantMessageId, c.clarification.autoSelect(option.label));
        abortController.abort();
        editorAiService.cancel();
        finishActiveRun(c.status.ready);
        window.setTimeout(() => {
          void runAssistant(trimmedPrompt, option, c.clarification.autoSelect(option.label), autoChoiceDepth + 1);
        }, 0);
        return;
      }

      receivedClarification = true;
      finalStatus = c.status.awaitingChoice;
      setStatus(c.status.awaitingChoice);
      setAssistantClarification(assistantMessageId, clarification, trimmedPrompt);
      abortController.abort();
      editorAiService.cancel();
      finishActiveRun(c.status.awaitingChoice);
    };

    try {
      await editorAiService.editCanvas({
        prompt: trimmedPrompt,
        document: currentDocument,
        pages,
        conversation,
        conversationId: providerConversationId,
        selectedNode,
        selectedDescriptor,
        clarificationChoice,
        applyInstructions: onApplyInstructions,
        signal: abortController.signal,
        onEvent: (event) => {
          if (finished || (receivedClarification && event.type !== 'done')) {
            return;
          }

          switch (event.type) {
            case 'intent_plan': {
              setIntentPlan(parseIntentPlan(event.data));
              setStatus(c.status.intentRecognized);
              break;
            }
            case 'clarification': {
              const clarification = parseClarification(event.data);
              if (clarification) {
                pauseForClarification(clarification);
              }
              break;
            }
            case 'text':
              appendAssistantDelta(assistantMessageId, event.data);
              break;
            case 'tool_start':
              setStatus(c.status.editingCanvas);
              break;
            case 'edit_applied':
              {
                const payload = parseEditAppliedPayload(event.data);
                const clarification = buildApplyFailureClarification(payload, currentDocument);
                if (clarification) {
                  pauseForClarification(clarification);
                  break;
                }
                replaceAssistantEditStatus(assistantMessageId, describeAppliedEdits(payload));
              }
              break;
            case 'tool_done':
              setStatus(c.status.editApplied);
              break;
            case 'error':
              completeStreamingMessages();
              setStatus(c.status.failed);
              appendMessage({
                id: createMessageId('system'),
                role: 'system',
                text: event.data,
              });
              if (event.terminal) {
                abortController.abort();
                editorAiService.cancel();
                finishActiveRun(c.status.failed);
              }
              break;
            case 'done':
              finishActiveRun(receivedClarification ? c.status.awaitingChoice : c.status.ready);
              break;
          }
        },
      });
    } catch (err) {
      if (!abortController.signal.aborted) {
        completeStreamingMessages();
        appendMessage({
          id: createMessageId('system'),
          role: 'system',
          text: err instanceof Error ? err.message : String(err),
        });
        finishActiveRun(c.status.failed);
      }
    } finally {
      finishActiveRun(finalStatus);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isRunning || disabled) {
      return;
    }

    void runAssistant(trimmedPrompt);
  }

  function handleClarificationSelect(option: AgentClarificationOption, message: ChatMessage) {
    if (isRunning || disabled) {
      return;
    }
    const sourceMessage = message as EditorAiMessage;
    const sourcePrompt = sourceMessage.clarificationPrompt ?? option.value;
    void runAssistant(sourcePrompt, option, c.clarification.select(option.label));
  }

  function handleClarificationCustomSubmit(value: string, message: ChatMessage) {
    const trimmedValue = value.trim();
    if (!trimmedValue || isRunning || disabled) {
      return;
    }

    const sourceMessage = message as EditorAiMessage;
    const sourcePrompt = sourceMessage.clarificationPrompt ?? trimmedValue;
    const option: AgentClarificationOption = {
      id: createMessageId('custom-clarification'),
      label: c.clarification.customChoiceLabel,
      description: trimmedValue,
      value: `User provided custom clarification: ${trimmedValue}`,
    };
    void runAssistant(sourcePrompt, option, c.clarification.customSupplement(trimmedValue));
  }

  function handleCancel() {
    const controller = abortRef.current;
    abortRef.current = null;
    controller?.abort();
    editorAiService.cancel();
    completeStreamingMessages();
    setIsRunning(false);
    setStatus(c.status.stopped);
  }

  const capabilityBadges = intentPlan
    ? [
        intentPlan.primaryCategory,
        intentPlan.generationStrategy,
        ...intentPlan.missingCapabilities.map((capability) => capability.id),
      ].slice(0, 3)
    : [];
  const cacheStatsBadges = buildCacheStatsBadges(cacheStats);

  return (
    <ChatPanel
      ariaLabel={c.ariaLabel}
      eyebrow={c.eyebrow}
      title={c.title}
      status={status}
      messages={messages}
      inputValue={prompt}
      inputPlaceholder={c.promptPlaceholder}
      submitLabel={c.execute}
      cancelLabel={c.cancel}
      disabled={disabled}
      isRunning={isRunning}
      badges={[...cacheStatsBadges, ...capabilityBadges]}
      streamingLabel={c.streamingPending}
      onInputChange={setPrompt}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      onClarificationSelect={handleClarificationSelect}
      onClarificationCustomSubmit={handleClarificationCustomSubmit}
      messagesEndRef={messagesEndRef}
    />
  );
}
