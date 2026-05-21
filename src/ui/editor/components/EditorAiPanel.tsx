'use client';

import type {
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from '../../layout/types';
import type {
  ApplyEditorAiEditInstructionsOptions,
  ApplyEditorAiEditInstructionsResult,
  EditorAiEditInstruction,
} from '../services/aiEditInstructions';
import { editorAiPanelContent as c } from './EditorAiPanel.content';
import type {
  AgentClarification,
  AgentClarificationOption,
} from '@shared/agent/types';
import type {
  EditorAiConversationMessage,
  EditorAiPageContext,
} from 'ai/editor-ai.service';
import type { UiIntentPlan } from 'ai/planning/ui-intent-router';
import { useAppServices } from 'hooks/useAppServices';
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type ChatMessage,
  ChatPanel,
} from 'ui/chat/ChatPanel';

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

interface EditorAiMessage extends ChatMessage {
  clarificationPrompt?: string;
}

type CompletedEditorAiMessage = EditorAiMessage & {
  role: EditorAiConversationMessage['role'];
};

interface EditAppliedEventPayload {
  applied?: string[];
  errors?: string[];
  reason?: string;
}

const MAX_STORED_MESSAGES = 40;
const MAX_CONVERSATION_CONTEXT_CHARS = 500_000;
const MAX_CONVERSATION_MESSAGE_CHARS = 40_000;
const CONVERSATION_STORAGE_VERSION = 1;
const CONVERSATION_STORAGE_PREFIX = 'editor-ai:conversation:';

interface StoredEditorAiConversation {
  version: typeof CONVERSATION_STORAGE_VERSION;
  messages: EditorAiMessage[];
}

const INITIAL_MESSAGES: EditorAiMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text: c.initialMessage,
  },
];

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function buildTemplateConversationKey(templateId: string): string {
  return `${CONVERSATION_STORAGE_PREFIX}${templateId}`;
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
    return Array.isArray(parsed.options) && parsed.options.length > 0
      ? parsed
      : null;
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

  const appliedText = applied.length
    ? `${c.appliedPrefix}${applied.join(c.listDelimiter)}`
    : '';
  const errorText = errors.length
    ? `${c.incompletePrefix}${errors.join(c.errorDelimiter)}`
    : '';

  return [payload.reason, appliedText, errorText].filter(Boolean).join('\n');
}

function trimConversationText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CONVERSATION_MESSAGE_CHARS) {
    return trimmed;
  }

  return `[Earlier content omitted]\n${trimmed.slice(-MAX_CONVERSATION_MESSAGE_CHARS)}`;
}

function isConversationRole(
  role: EditorAiMessage['role'],
): role is EditorAiConversationMessage['role'] {
  return role === 'user' || role === 'assistant';
}

function isCompletedConversationMessage(
  message: EditorAiMessage,
): message is EditorAiMessage & { role: EditorAiConversationMessage['role'] } {
  return (
    message.id !== 'welcome'
    && !message.streaming
    && isConversationRole(message.role)
    && message.text.trim().length > 0
  );
}

function normalizeStoredMessages(
  messages: readonly EditorAiMessage[],
): CompletedEditorAiMessage[] {
  return messages
    .filter(isCompletedConversationMessage)
    .slice(-MAX_STORED_MESSAGES)
    .map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
    }));
}

function loadStoredMessages(storageKey: string): EditorAiMessage[] {
  if (typeof window === 'undefined') {
    return INITIAL_MESSAGES;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return INITIAL_MESSAGES;
    }

    const parsed = JSON.parse(raw) as Partial<StoredEditorAiConversation>;
    const storedMessages = Array.isArray(parsed.messages)
      ? normalizeStoredMessages(parsed.messages)
      : [];
    return storedMessages.length
      ? [...INITIAL_MESSAGES, ...storedMessages]
      : INITIAL_MESSAGES;
  } catch {
    return INITIAL_MESSAGES;
  }
}

function saveStoredMessages(
  storageKey: string,
  messages: readonly EditorAiMessage[],
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const storedMessages = normalizeStoredMessages(messages);
  try {
    if (!storedMessages.length) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    const payload: StoredEditorAiConversation = {
      version: CONVERSATION_STORAGE_VERSION,
      messages: storedMessages,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Local storage can fail in private mode or when quota is exceeded.
  }
}

function buildConversationContext(
  messages: readonly EditorAiMessage[],
): EditorAiConversationMessage[] {
  const normalized = messages
    .filter(isCompletedConversationMessage)
    .map((message) => ({
      role: message.role,
      content: trimConversationText(message.text),
    }));
  const output: EditorAiConversationMessage[] = [];
  let totalChars = 0;
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const message = normalized[index];
    const nextTotal = totalChars + message.content.length;
    if (nextTotal > MAX_CONVERSATION_CONTEXT_CHARS) {
      break;
    }
    output.unshift(message);
    totalChars = nextTotal;
  }
  return output;
}

function buildPersistedConversation(
  messages: readonly EditorAiMessage[],
): EditorAiConversationMessage[] {
  return normalizeStoredMessages(messages).map((message) => ({
    role: message.role,
    content: message.text.trim(),
  }));
}

function buildMessagesFromConversation(
  conversation: readonly EditorAiConversationMessage[],
): EditorAiMessage[] {
  return conversation
    .slice(-MAX_STORED_MESSAGES)
    .map((message, index) => ({
      id: `history-${index}-${message.role}`,
      role: message.role,
      text: message.content,
    }));
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
  const templateConversationKey = buildTemplateConversationKey(
    conversationTemplateId,
  );
  const providerConversationId = buildProviderConversationId(
    conversationTemplateId,
  );
  const abortRef = useRef<AbortController | null>(null);
  const activeConversationKeyRef = useRef(templateConversationKey);
  const remoteConversationTemplateRef = useRef<string | null>(null);
  const lastRemoteConversationRef = useRef('');
  const saveConversationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const skipNextConversationSaveRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<EditorAiMessage[]>(
    () => loadStoredMessages(templateConversationKey),
  );
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<string>(c.status.ready);
  const [isRunning, setIsRunning] = useState(false);
  const [intentPlan, setIntentPlan] = useState<UiIntentPlan | null>(null);

  function appendMessage(message: EditorAiMessage) {
    setMessages((current) => [...current, message].slice(-MAX_STORED_MESSAGES));
  }

  function appendAssistantDelta(messageId: string, text: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, text: `${message.text}${text}`, streaming: true }
          : message,
      ),
    );
  }

  function setAssistantClarification(
    messageId: string,
    clarification: AgentClarification,
    sourcePrompt: string,
  ) {
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
      current.map((message) =>
        message.id === messageId
          ? { ...message, streaming: false }
          : message,
      ),
    );
  }

  function completeStreamingMessages() {
    setMessages((current) =>
      current.map((message) => (
        message.streaming ? { ...message, streaming: false } : message
      )),
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
    setIsRunning(false);
    activeConversationKeyRef.current = templateConversationKey;
    skipNextConversationSaveRef.current = true;
    setMessages(loadStoredMessages(templateConversationKey));
    setPrompt('');
    setStatus(c.status.ready);
    setIntentPlan(null);
  }, [editorAiService, templateConversationKey]);

  useEffect(() => {
    if (skipNextConversationSaveRef.current) {
      skipNextConversationSaveRef.current = false;
      return;
    }

    saveStoredMessages(templateConversationKey, messages);
    if (remoteConversationTemplateRef.current !== conversationTemplateId) {
      return;
    }

    const conversation = buildPersistedConversation(messages);
    const serialized = JSON.stringify(conversation);
    if (
      serialized === lastRemoteConversationRef.current
      || (!conversation.length && !lastRemoteConversationRef.current)
    ) {
      return;
    }

    if (saveConversationTimerRef.current) {
      clearTimeout(saveConversationTimerRef.current);
    }
    saveConversationTimerRef.current = setTimeout(() => {
      void editorAiService.saveConversation(
        conversationTemplateId,
        conversation,
      )
        .then(() => {
          lastRemoteConversationRef.current = serialized;
        })
        .catch(() => undefined);
    }, 600);
  }, [
    conversationTemplateId,
    editorAiService,
    messages,
    templateConversationKey,
  ]);

  useEffect(() => {
    let cancelled = false;
    const templateIdForLoad = conversationTemplateId;
    void editorAiService.loadConversation(templateIdForLoad)
      .then((conversation) => {
        if (cancelled || activeConversationKeyRef.current !== templateConversationKey) {
          return;
        }

        const remoteMessages = buildMessagesFromConversation(conversation);
        remoteConversationTemplateRef.current = templateIdForLoad;
        lastRemoteConversationRef.current = JSON.stringify(
          buildPersistedConversation(remoteMessages),
        );
        if (!remoteMessages.length) {
          return;
        }

        const nextMessages = [...INITIAL_MESSAGES, ...remoteMessages];
        setMessages(nextMessages);
        saveStoredMessages(templateConversationKey, nextMessages);
      })
      .catch(() => {
        if (!cancelled) {
          remoteConversationTemplateRef.current = templateIdForLoad;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationTemplateId, editorAiService, templateConversationKey]);

  useEffect(() => () => {
    if (saveConversationTimerRef.current) {
      clearTimeout(saveConversationTimerRef.current);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, status]);

  async function runAssistant(
    trimmedPrompt: string,
    clarificationChoice?: AgentClarificationOption | null,
    displayText = trimmedPrompt,
  ) {
    const assistantMessageId = createMessageId('assistant');
    const abortController = new AbortController();
    const conversation = buildConversationContext(messages);
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
          switch (event.type) {
            case 'intent_plan': {
              setIntentPlan(parseIntentPlan(event.data));
              setStatus(c.status.intentRecognized);
              break;
            }
            case 'clarification': {
              const clarification = parseClarification(event.data);
              if (clarification) {
                receivedClarification = true;
                finalStatus = c.status.awaitingChoice;
                setStatus(c.status.awaitingChoice);
                setAssistantClarification(
                  assistantMessageId,
                  clarification,
                  trimmedPrompt,
                );
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
              appendAssistantDelta(
                assistantMessageId,
                `\n\n${describeAppliedEdits(parseEditAppliedPayload(event.data))}`,
              );
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

  function handleClarificationSelect(
    option: AgentClarificationOption,
    message: ChatMessage,
  ) {
    if (isRunning || disabled) {
      return;
    }
    const sourceMessage = message as EditorAiMessage;
    const sourcePrompt = sourceMessage.clarificationPrompt ?? option.value;
    void runAssistant(sourcePrompt, option, `选择：${option.label}`);
  }

  function handleClarificationCustomSubmit(
    value: string,
    message: ChatMessage,
  ) {
    const trimmedValue = value.trim();
    if (!trimmedValue || isRunning || disabled) {
      return;
    }

    const sourceMessage = message as EditorAiMessage;
    const sourcePrompt = sourceMessage.clarificationPrompt ?? trimmedValue;
    const option: AgentClarificationOption = {
      id: createMessageId('custom-clarification'),
      label: '其他：自定义说明',
      description: trimmedValue,
      value: `User provided custom clarification: ${trimmedValue}`,
    };
    void runAssistant(sourcePrompt, option, `补充说明：${trimmedValue}`);
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
      badges={capabilityBadges}
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
