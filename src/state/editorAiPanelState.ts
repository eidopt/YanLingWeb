'use client';

import type { EditorAiCacheStats, EditorAiConversationMessage } from 'ai/editorAi.service';
import type { UiIntentPlan } from 'ai/planning/uiIntentRouter';
import { useSyncExternalStore } from 'react';
import { createPersistentStore } from 'state/createPersistentStore';
import {
  getBrowserStateStorage,
  readPersistedObject,
  type StateStorage,
  writePersistedObject,
} from 'state/statePersistence';
import type { ChatMessage } from 'ui/chat/ChatPanel';

export interface EditorAiPanelMessage extends ChatMessage {
  clarificationPrompt?: string;
  reasoningDelta?: string;
}

export interface EditorAiPanelSnapshot {
  conversationKey: string;
  messages: EditorAiPanelMessage[];
  prompt: string;
  status: string;
  isRunning: boolean;
  intentPlan: UiIntentPlan | null;
  cacheStats: EditorAiCacheStats | null;
}

type MessageUpdater = EditorAiPanelMessage[] | ((current: EditorAiPanelMessage[]) => EditorAiPanelMessage[]);

export const EDITOR_AI_PANEL_MAX_STORED_MESSAGES = 40;
export const EDITOR_AI_PANEL_CONVERSATION_STORAGE_VERSION = 1;
export const EDITOR_AI_PANEL_CONVERSATION_STORAGE_PREFIX = 'editor-ai:conversation:';

const STORE_NAME = 'editorAiPanel';
const MAX_CONVERSATION_CONTEXT_CHARS = 500_000;
const MAX_CONVERSATION_MESSAGE_CHARS = 40_000;

const INITIAL_SNAPSHOT: EditorAiPanelSnapshot = {
  conversationKey: '',
  messages: [],
  prompt: '',
  status: '',
  isRunning: false,
  intentPlan: null,
  cacheStats: null,
};

function createInitialSnapshot(
  conversationKey: string,
  messages: EditorAiPanelMessage[],
  readyStatus: string,
): EditorAiPanelSnapshot {
  return {
    conversationKey,
    messages,
    prompt: '',
    status: readyStatus,
    isRunning: false,
    intentPlan: null,
    cacheStats: null,
  };
}

export function buildEditorAiPanelConversationStorageKey(templateId: string): string {
  return `${EDITOR_AI_PANEL_CONVERSATION_STORAGE_PREFIX}${templateId}`;
}

function trimConversationText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CONVERSATION_MESSAGE_CHARS) {
    return trimmed;
  }

  return `[Earlier content omitted]\n${trimmed.slice(-MAX_CONVERSATION_MESSAGE_CHARS)}`;
}

function isConversationRole(role: EditorAiPanelMessage['role']): role is EditorAiConversationMessage['role'] {
  return role === 'user' || role === 'assistant';
}

function isCompletedConversationMessage(
  message: EditorAiPanelMessage,
): message is EditorAiPanelMessage & { role: EditorAiConversationMessage['role'] } {
  return (
    message.id !== 'welcome' && !message.streaming && isConversationRole(message.role) && message.text.trim().length > 0
  );
}

function readEditorAiPanelMessage(value: unknown): EditorAiPanelMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = record.id;
  const role = record.role;
  const text = record.text;
  if (
    typeof id !== 'string' ||
    (role !== 'user' && role !== 'assistant' && role !== 'system') ||
    typeof text !== 'string'
  ) {
    return null;
  }

  return {
    id,
    role,
    text,
    streaming: record.streaming === true,
    reasoningDelta: typeof record.reasoningDelta === 'string' ? record.reasoningDelta : undefined,
  };
}

export function normalizeEditorAiPanelStoredMessages(
  messages: readonly EditorAiPanelMessage[],
): (EditorAiPanelMessage & { role: EditorAiConversationMessage['role'] })[] {
  return messages
    .filter(isCompletedConversationMessage)
    .slice(-EDITOR_AI_PANEL_MAX_STORED_MESSAGES)
    .map((message) => {
      const normalized: EditorAiPanelMessage & { role: EditorAiConversationMessage['role'] } = {
        id: message.id,
        role: message.role,
        text: message.text,
      };
      if (message.reasoningDelta) {
        normalized.reasoningDelta = message.reasoningDelta;
      }
      return normalized;
    });
}

export function restoreEditorAiPanelConversationMessages(
  storage: StateStorage | null,
  storageKey: string,
  fallback: EditorAiPanelMessage[],
): EditorAiPanelMessage[] {
  const persisted = readPersistedObject(storage, storageKey);
  if (!persisted) {
    return fallback;
  }

  if (persisted.version !== EDITOR_AI_PANEL_CONVERSATION_STORAGE_VERSION || !Array.isArray(persisted.messages)) {
    storage?.removeItem(storageKey);
    return fallback;
  }

  const messages = persisted.messages.flatMap((message) => {
    const parsed = readEditorAiPanelMessage(message);
    return parsed ? [parsed] : [];
  });
  const storedMessages = normalizeEditorAiPanelStoredMessages(messages);
  return storedMessages.length ? [...fallback, ...storedMessages] : fallback;
}

export function persistEditorAiPanelConversationMessages(
  storage: StateStorage | null,
  storageKey: string,
  messages: readonly EditorAiPanelMessage[],
): void {
  if (!storage) {
    return;
  }

  const storedMessages = normalizeEditorAiPanelStoredMessages(messages);
  if (!storedMessages.length) {
    storage.removeItem(storageKey);
    return;
  }

  writePersistedObject(storage, storageKey, {
    version: EDITOR_AI_PANEL_CONVERSATION_STORAGE_VERSION,
    messages: storedMessages,
  });
}

export function loadBrowserEditorAiPanelConversationMessages(
  storageKey: string,
  fallback: EditorAiPanelMessage[],
): EditorAiPanelMessage[] {
  return restoreEditorAiPanelConversationMessages(getBrowserStateStorage(), storageKey, fallback);
}

export function saveBrowserEditorAiPanelConversationMessages(
  storageKey: string,
  messages: readonly EditorAiPanelMessage[],
): void {
  persistEditorAiPanelConversationMessages(getBrowserStateStorage(), storageKey, messages);
}

export function buildEditorAiPanelConversationContext(
  messages: readonly EditorAiPanelMessage[],
): EditorAiConversationMessage[] {
  const normalized = messages.filter(isCompletedConversationMessage).map((message) => ({
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

export function buildPersistedEditorAiPanelConversation(
  messages: readonly EditorAiPanelMessage[],
): EditorAiConversationMessage[] {
  return normalizeEditorAiPanelStoredMessages(messages).map((message) => ({
    role: message.role,
    content: message.text.trim(),
  }));
}

function resolveMessageUpdater(current: EditorAiPanelMessage[], updater: MessageUpdater): EditorAiPanelMessage[] {
  return typeof updater === 'function' ? updater(current) : updater;
}

const store = createPersistentStore<EditorAiPanelSnapshot>({
  name: STORE_NAME,
  initialSnapshot: INITIAL_SNAPSHOT,
  // Snapshot holds nested message arrays + plan/cache objects, so dedup by deep value.
  areEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
});

function ensureConversation(
  conversationKey: string,
  createMessages: () => EditorAiPanelMessage[],
  readyStatus: string,
): void {
  if (store.peek().conversationKey === conversationKey) {
    return;
  }

  store.commitSilently(createInitialSnapshot(conversationKey, createMessages(), readyStatus));
}

export const editorAiPanelStateActions = {
  resetConversation: (conversationKey: string, messages: EditorAiPanelMessage[], readyStatus: string) =>
    store.update(createInitialSnapshot(conversationKey, messages, readyStatus)),
  setMessages: (updater: MessageUpdater) =>
    store.update((current) => ({
      ...current,
      messages: resolveMessageUpdater(current.messages, updater),
    })),
  setPrompt: (prompt: string) => store.update((current) => ({ ...current, prompt })),
  setStatus: (status: string) => store.update((current) => ({ ...current, status })),
  setIsRunning: (isRunning: boolean) => store.update((current) => ({ ...current, isRunning })),
  setIntentPlan: (intentPlan: UiIntentPlan | null) => store.update((current) => ({ ...current, intentPlan })),
  setCacheStats: (cacheStats: EditorAiCacheStats | null) => store.update((current) => ({ ...current, cacheStats })),
};

export function useEditorAiPanelSnapshot(
  conversationKey: string,
  createInitialMessages: () => EditorAiPanelMessage[],
  readyStatus: string,
): EditorAiPanelSnapshot {
  ensureConversation(conversationKey, createInitialMessages, readyStatus);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
