'use client';

import type { ThemeComponentDescriptor, ThemeLayoutDocument, ThemeLayoutNode } from '../../layout/types';
import type {
  ApplyEditorAiEditInstructionsOptions,
  ApplyEditorAiEditInstructionsResult,
  EditorAiEditInstruction,
} from '../services/aiEditInstructions';
import { decideConversationHistoryLoad } from '../stream/conversationHistory';
import { createSseOutputBridge, type SseOutputBridge } from '../stream/sseOutputBridge';
import type { SseOutputFrame } from '../stream/sseOutputController';
import { editorAiPanelContent as c } from './EditorAiPanel.content';
import {
  appendAssistantReasoning,
  applyCacheDiagnostic,
  buildApplyFailureClarification,
  buildCacheStatsBadges,
  buildMessagesFromConversation,
  buildProviderConversationId,
  buildReasoningAccumulator,
  CACHE_STATS_REFRESH_INTERVAL_MS,
  createMessageId,
  describeAppliedEdits,
  type EditorAiMessage,
  hasStreamingMessages,
  INITIAL_MESSAGES,
  parseClarification,
  parseEditAppliedPayload,
  parseIntentPlan,
  replaceLatestEditStatus,
} from './EditorAiPanel.helpers';
import { EditorAiPanelState } from './editorAiPanelState';
import type { AgentClarification, AgentClarificationOption } from '@shared/agent/contracts/agent';
import type { EditorAiPageContext } from 'ai/editorAi.service';
import { useAppServices } from 'hooks/useAppServices';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  buildEditorAiPanelConversationContext,
  buildEditorAiPanelConversationStorageKey,
  buildPersistedEditorAiPanelConversation,
  EDITOR_AI_PANEL_MAX_STORED_MESSAGES,
  editorAiPanelStateActions,
  loadBrowserEditorAiPanelConversationMessages,
  saveBrowserEditorAiPanelConversationMessages,
  useEditorAiPanelSnapshot,
} from 'state/editorAiPanelState';
import { type ChatMessage, ChatPanel } from 'ui/chat/ChatPanel';
import { ReasoningPanel } from 'ui/chat/ReasoningPanel';

interface EditorAiPanelProps {
  templateId?: string;
  currentDocument: ThemeLayoutDocument;
  documentForAi?: ThemeLayoutDocument;
  pages?: EditorAiPageContext[];
  selectedNode: ThemeLayoutNode | null;
  selectedDescriptor: ThemeComponentDescriptor | null;
  disabled?: boolean;
  onApplyInstructions: (
    instructions: readonly EditorAiEditInstruction[],
    options?: ApplyEditorAiEditInstructionsOptions,
  ) => ApplyEditorAiEditInstructionsResult;
  undoState?: EditorAiPanelState;
  onUndo?: () => void;
}

export function EditorAiPanel({
  templateId,
  currentDocument,
  documentForAi,
  pages,
  selectedNode,
  selectedDescriptor,
  disabled = false,
  onApplyInstructions,
  undoState,
  onUndo,
}: EditorAiPanelProps) {
  const { editorAiService } = useAppServices();
  // 本地兜底的 undo 状态：当父组件未注入时使用（便于单测/独立使用），正常流程下由 ThemeLayoutBuilder 注入。
  const [localUndoState] = useState(() => new EditorAiPanelState());
  const panelStateRef = useRef<EditorAiPanelState>(undoState ?? localUndoState);
  const [, setUndoVersion] = useState(0);
  const conversationTemplateId = templateId ?? currentDocument.themeId;
  const templateConversationKey = buildEditorAiPanelConversationStorageKey(conversationTemplateId);
  const providerConversationId = buildProviderConversationId(conversationTemplateId);
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef<SseOutputBridge | null>(null);
  const liveRunRef = useRef<{ sessionId: string; onControl: (frame: SseOutputFrame) => void } | null>(null);
  const historyEpochRef = useRef(0);
  const endStatusRef = useRef<string | null>(null);
  const applyPacedFrameRef = useRef<(frame: SseOutputFrame) => void>(() => undefined);
  const activeConversationKeyRef = useRef(templateConversationKey);
  const remoteConversationTemplateRef = useRef<string | null>(null);
  const lastRemoteConversationRef = useRef('');
  const saveConversationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextConversationSaveRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const currentDocumentRef = useRef(currentDocument);
  const documentForAiRef = useRef(documentForAi ?? currentDocument);

  useEffect(() => {
    currentDocumentRef.current = currentDocument;
    documentForAiRef.current = documentForAi ?? currentDocument;
  }, [currentDocument, documentForAi]);
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

  // 最近一次 cache_diagnostic 事件 (P0 可观测性): 每轮更新一次, 用于面板顶部 badge.
  // 字段: prefixHash (sha256 16-hex), cacheHitRate (0..1 or null), compactionStrategy, prefixChanged.
  const [latestCacheDiagnostic, setLatestCacheDiagnostic] = useState<{
    prefixHash: string;
    cacheHitRate: number | null;
    compactionStrategy: 'skip' | 'micro' | 'full' | null;
    prefixChanged: boolean;
  } | null>(null);

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

  applyPacedFrameRef.current = (frame) => {
    if (frame.kind === 'text' && frame.messageId && frame.text) {
      appendAssistantDelta(frame.messageId, frame.text);
      return;
    }
    if (frame.kind === 'reasoning' && frame.messageId && frame.text) {
      appendAssistantReasoning(frame.messageId, frame.text, setMessages);
    }
  };

  useEffect(() => {
    const bridge = createSseOutputBridge({
      onFrames: (sessionId, frames) => {
        const live = liveRunRef.current;
        if (live?.sessionId !== sessionId) {
          return;
        }
        for (const frame of frames) {
          if (frame.kind === 'control') {
            live.onControl(frame);
            continue;
          }
          applyPacedFrameRef.current(frame);
        }
      },
    });
    streamRef.current = bridge;
    return () => {
      liveRunRef.current = null;
      bridge.dispose();
      if (streamRef.current === bridge) {
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (activeConversationKeyRef.current === templateConversationKey) {
      return;
    }

    historyEpochRef.current += 1;
    endStatusRef.current = null;
    liveRunRef.current = null;
    streamRef.current?.reset();
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
    const requestEpoch = historyEpochRef.current;
    void editorAiService
      .loadConversation(templateIdForLoad)
      .then((conversation) => {
        if (cancelled || activeConversationKeyRef.current !== templateConversationKey) {
          return;
        }

        remoteConversationTemplateRef.current = templateIdForLoad;
        const remoteMessages = buildMessagesFromConversation(conversation);
        setMessages((current) => {
          const decision = decideConversationHistoryLoad({
            requestEpoch,
            currentEpoch: historyEpochRef.current,
            live: liveRunRef.current !== null,
            localCompletedCount: buildPersistedEditorAiPanelConversation(current).length,
            remoteCount: remoteMessages.length,
          });
          if (decision !== 'replace') {
            if (decision === 'keep' && remoteMessages.length > 0) {
              lastRemoteConversationRef.current = JSON.stringify(
                buildPersistedEditorAiPanelConversation(remoteMessages),
              );
            }
            return current;
          }

          const nextMessages = [...INITIAL_MESSAGES, ...remoteMessages];
          lastRemoteConversationRef.current = JSON.stringify(buildPersistedEditorAiPanelConversation(nextMessages));
          saveBrowserEditorAiPanelConversationMessages(templateConversationKey, nextMessages);
          return nextMessages;
        });
      })
      .catch(() => {
        if (!cancelled && activeConversationKeyRef.current === templateConversationKey) {
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
    const sessionId = assistantMessageId;
    const abortController = new AbortController();
    const conversation = buildEditorAiPanelConversationContext(messages);
    historyEpochRef.current += 1;
    endStatusRef.current = null;
    streamRef.current?.start(sessionId);
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

    const onControl = (frame: SseOutputFrame) => {
      if (finished || (receivedClarification && frame.name !== 'done')) {
        return;
      }

      switch (frame.name) {
        case 'intent_plan': {
          setIntentPlan(parseIntentPlan(frame.data ?? ''));
          setStatus(c.status.intentRecognized);
          break;
        }
        case 'clarification': {
          const clarification = parseClarification(frame.data ?? '');
          if (clarification) {
            pauseForClarification(clarification);
          }
          break;
        }
        case 'tool_start':
          setStatus(c.status.editingCanvas);
          break;
        case 'edit_applied': {
          const payload = parseEditAppliedPayload(frame.data ?? '');
          const clarification = buildApplyFailureClarification(payload, documentForAiRef.current);
          if (clarification) {
            pauseForClarification(clarification);
            break;
          }
          replaceAssistantEditStatus(assistantMessageId, describeAppliedEdits(payload));
          break;
        }
        case 'tool_done':
          setStatus(c.status.editApplied);
          break;
        case 'error':
          completeStreamingMessages();
          setStatus(c.status.failed);
          appendMessage({
            id: createMessageId('system'),
            role: 'system',
            text: frame.data ?? '',
          });
          if (frame.terminal) {
            abortController.abort();
            editorAiService.cancel();
            endStatusRef.current = c.status.failed;
            finishActiveRun(c.status.failed);
          }
          break;
        case 'done':
          finishActiveRun(receivedClarification ? c.status.awaitingChoice : c.status.ready);
          break;
        case 'cache_diagnostic':
          applyCacheDiagnostic(frame.data ?? '', setLatestCacheDiagnostic);
          break;
        default:
          break;
      }
    };
    liveRunRef.current = { sessionId, onControl };

    try {
      await editorAiService.editCanvas({
        prompt: trimmedPrompt,
        document: documentForAiRef.current,
        getCurrentDocument: () => currentDocumentRef.current,
        pages,
        conversation,
        conversationId: providerConversationId,
        selectedNode,
        selectedDescriptor,
        clarificationChoice,
        applyInstructions: onApplyInstructions,
        // B.3: B.2 会在 edit_request 前由 EditorAiService 主动压栈；这里只负责消费快照。
        onSnapshot: (snapshot) => {
          panelStateRef.current.pushSnapshot(snapshot, currentDocumentRef.current);
          setUndoVersion((value) => value + 1);
        },
        signal: abortController.signal,
        onEvent: (event) => {
          if (finished || (receivedClarification && event.type !== 'done')) {
            return;
          }
          if (event.type === 'text') {
            streamRef.current?.enqueue(sessionId, {
              kind: 'text',
              messageId: assistantMessageId,
              text: event.data,
            });
            return;
          }
          if (event.type === 'reasoning') {
            streamRef.current?.enqueue(sessionId, {
              kind: 'reasoning',
              messageId: assistantMessageId,
              text: event.data,
            });
            return;
          }
          streamRef.current?.enqueue(sessionId, {
            kind: 'control',
            name: event.type,
            data: event.data,
            terminal: event.terminal,
          });
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
        endStatusRef.current = c.status.failed;
      }
    } finally {
      const bridge = streamRef.current;
      if (bridge) {
        await bridge.flush(sessionId);
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- cleared while flush awaits
      if (liveRunRef.current?.sessionId === sessionId) {
        liveRunRef.current = null;
      }
      finishActiveRun(endStatusRef.current ?? finalStatus);
      endStatusRef.current = null;
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
    endStatusRef.current = c.status.stopped;
    setStatus(c.status.stopped);
    abortRef.current?.abort();
    editorAiService.cancel();
  }

  function handleUndo() {
    if (isRunning || disabled) {
      return;
    }
    if (onUndo) {
      onUndo();
    } else {
      // 当父组件未提供 onUndo 时，仅出栈，不修改画布。
      panelStateRef.current.pop();
      setUndoVersion((value) => value + 1);
    }
  }

  const capabilityBadges = intentPlan
    ? [
        intentPlan.primaryCategory,
        intentPlan.generationStrategy,
        ...intentPlan.missingCapabilities.map((capability) => capability.id),
      ].slice(0, 3)
    : [];
  const cacheStatsBadges = buildCacheStatsBadges(cacheStats);
  // 把最近一次 cache_diagnostic 折叠为单条 badge, 便于在面板顶部一目了然.
  // 格式: "cache:abc12345 · 87% · skip" (命中率为 0..1 → 百分比; 策略为 null 时省略)
  const cacheDiagnosticBadge = latestCacheDiagnostic
    ? [
        `cache:${latestCacheDiagnostic.prefixHash.slice(0, 8)}`,
        latestCacheDiagnostic.cacheHitRate !== null ? `${Math.round(latestCacheDiagnostic.cacheHitRate * 100)}%` : '—',
        ...(latestCacheDiagnostic.compactionStrategy ? [latestCacheDiagnostic.compactionStrategy] : []),
      ].join(' · ')
    : null;

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
      badges={[...cacheStatsBadges, ...(cacheDiagnosticBadge ? [cacheDiagnosticBadge] : []), ...capabilityBadges]}
      streamingLabel={c.streamingPending}
      onInputChange={setPrompt}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      onClarificationSelect={handleClarificationSelect}
      onClarificationCustomSubmit={handleClarificationCustomSubmit}
      messagesEndRef={messagesEndRef}
      renderAfterMessages={<ReasoningPanel content={buildReasoningAccumulator(messages)} label={c.reasoning.label} />}
      undoButtonLabel="撤销"
      onUndo={handleUndo}
      undoAvailableCount={panelStateRef.current.size}
    />
  );
}
