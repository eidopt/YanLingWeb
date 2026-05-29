'use client';

import type { EditorAiCacheStats, EditorAiConversationMessage } from 'ai/editor-ai.service';
import type { UiIntentPlan } from 'ai/planning/ui-intent-router';
import { useSyncExternalStore } from 'react';
import { recordStateDebugTransition, registerStateDebugStore } from 'state/stateDebugRegistry';
import {
  getBrowserStateStorage,
  readPersistedObject,
  type StateStorage,
  writePersistedObject,
} from 'state/statePersistence';
import type { ChatMessage } from 'ui/chat/ChatPanel';

export interface EditorAiPanelMessage extends ChatMessage {
  clarificationPrompt?: string;
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

type EditorAiPanelListener = () => void;
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
  };
}

export function normalizeEditorAiPanelStoredMessages(
  messages: readonly EditorAiPanelMessage[],
): (EditorAiPanelMessage & { role: EditorAiConversationMessage['role'] })[] {
  return messages
    .filter(isCompletedConversationMessage)
    .slice(-EDITOR_AI_PANEL_MAX_STORED_MESSAGES)
    .map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
    }));
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

class EditorAiPanelStateStore {
  private readonly listeners = new Set<EditorAiPanelListener>();
  private registered = false;
  private snapshot = INITIAL_SNAPSHOT;

  getSnapshot = (): EditorAiPanelSnapshot => this.snapshot;

  getServerSnapshot = (): EditorAiPanelSnapshot => INITIAL_SNAPSHOT;

  subscribe = (listener: EditorAiPanelListener): (() => void) => {
    this.listeners.add(listener);
    this.registerDebugStore();
    return () => {
      this.listeners.delete(listener);
    };
  };

  ensureConversation(conversationKey: string, createMessages: () => EditorAiPanelMessage[], readyStatus: string): void {
    if (this.snapshot.conversationKey === conversationKey) {
      return;
    }

    this.setSnapshot(createInitialSnapshot(conversationKey, createMessages(), readyStatus), false);
  }

  resetConversation(conversationKey: string, messages: EditorAiPanelMessage[], readyStatus: string): void {
    this.setSnapshot(createInitialSnapshot(conversationKey, messages, readyStatus));
  }

  setMessages(updater: MessageUpdater): void {
    this.update((current) => ({
      ...current,
      messages: resolveMessageUpdater(current.messages, updater),
    }));
  }

  setPrompt(prompt: string): void {
    this.update((current) => ({ ...current, prompt }));
  }

  setStatus(status: string): void {
    this.update((current) => ({ ...current, status }));
  }

  setIsRunning(isRunning: boolean): void {
    this.update((current) => ({ ...current, isRunning }));
  }

  setIntentPlan(intentPlan: UiIntentPlan | null): void {
    this.update((current) => ({ ...current, intentPlan }));
  }

  setCacheStats(cacheStats: EditorAiCacheStats | null): void {
    this.update((current) => ({ ...current, cacheStats }));
  }

  private update(updater: (current: EditorAiPanelSnapshot) => EditorAiPanelSnapshot): void {
    this.setSnapshot(updater(this.snapshot));
  }

  private setSnapshot(next: EditorAiPanelSnapshot, notify = true): void {
    if (this.createSnapshotKey(next) === this.createSnapshotKey(this.snapshot)) {
      return;
    }

    this.snapshot = next;
    if (!notify) {
      return;
    }

    recordStateDebugTransition(STORE_NAME, this.snapshot);
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  private registerDebugStore(): void {
    if (this.registered) {
      return;
    }

    registerStateDebugStore(STORE_NAME, this.getSnapshot);
    this.registered = true;
  }

  private createSnapshotKey(snapshot: EditorAiPanelSnapshot): string {
    return JSON.stringify(snapshot);
  }
}

const editorAiPanelStateStore = new EditorAiPanelStateStore();

export const editorAiPanelStateActions = {
  resetConversation: (conversationKey: string, messages: EditorAiPanelMessage[], readyStatus: string) =>
    editorAiPanelStateStore.resetConversation(conversationKey, messages, readyStatus),
  setMessages: (updater: MessageUpdater) => editorAiPanelStateStore.setMessages(updater),
  setPrompt: (prompt: string) => editorAiPanelStateStore.setPrompt(prompt),
  setStatus: (status: string) => editorAiPanelStateStore.setStatus(status),
  setIsRunning: (isRunning: boolean) => editorAiPanelStateStore.setIsRunning(isRunning),
  setIntentPlan: (intentPlan: UiIntentPlan | null) => editorAiPanelStateStore.setIntentPlan(intentPlan),
  setCacheStats: (cacheStats: EditorAiCacheStats | null) => editorAiPanelStateStore.setCacheStats(cacheStats),
};

export function useEditorAiPanelSnapshot(
  conversationKey: string,
  createInitialMessages: () => EditorAiPanelMessage[],
  readyStatus: string,
): EditorAiPanelSnapshot {
  editorAiPanelStateStore.ensureConversation(conversationKey, createInitialMessages, readyStatus);

  return useSyncExternalStore(
    editorAiPanelStateStore.subscribe,
    editorAiPanelStateStore.getSnapshot,
    editorAiPanelStateStore.getServerSnapshot,
  );
}
