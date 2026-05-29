'use client';

import type { ThemeComponentDescriptor, ThemeLayoutDocument, ThemeLayoutNode } from '../../layout/types';
import type {
  ApplyEditorAiEditInstructionsOptions,
  ApplyEditorAiEditInstructionsResult,
  EditorAiEditInstruction,
} from '../services/aiEditInstructions';
import { editorAiPanelContent as c } from './EditorAiPanel.content';
import {
  buildApplyFailureClarification,
  buildCacheStatsBadges,
  buildMessagesFromConversation,
  buildProviderConversationId,
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
import type { AgentClarification, AgentClarificationOption } from '@shared/agent/contracts/agent';
import type { EditorAiPageContext } from 'ai/editor-ai.service';
import { useAppServices } from 'hooks/useAppServices';
import { type FormEvent, useCallback, useEffect, useRef } from 'react';
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
