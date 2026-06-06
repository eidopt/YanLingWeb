import {
  buildEditorAiPanelConversationContext,
  buildEditorAiPanelConversationStorageKey,
  buildPersistedEditorAiPanelConversation,
  type EditorAiPanelMessage,
  persistEditorAiPanelConversationMessages,
  restoreEditorAiPanelConversationMessages,
} from '../src/state/editorAiPanelState';
import {
  EDITOR_BUILDER_UI_STATE_STORAGE_KEY,
  type EditorBuilderUiSnapshot,
  persistEditorBuilderUiSnapshot,
  restoreEditorBuilderUiSnapshot,
} from '../src/state/editorBuilderUiState';
import type { StateStorage } from '../src/state/statePersistence';
import {
  persistTemplatesPageSnapshot,
  restoreTemplatesPageSnapshot,
  TEMPLATES_PAGE_STATE_STORAGE_KEY,
  type TemplatesPageSnapshot,
} from '../src/state/templatesPageState';
import assert from 'node:assert/strict';

class MemoryStorage implements StateStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const fallback: TemplatesPageSnapshot = {
  search: '',
  debouncedSearch: '',
  activeCategory: '',
  sortKey: 'default',
};

const storage = new MemoryStorage();
assert.deepEqual(restoreTemplatesPageSnapshot(null, fallback), fallback);
assert.deepEqual(restoreTemplatesPageSnapshot(storage, fallback), fallback);

persistTemplatesPageSnapshot(storage, {
  search: 'landing page',
  debouncedSearch: 'old debounced value',
  activeCategory: 'commerce',
  sortKey: 'newest',
});

assert.deepEqual(restoreTemplatesPageSnapshot(storage, fallback), {
  search: 'landing page',
  debouncedSearch: 'landing page',
  activeCategory: 'commerce',
  sortKey: 'newest',
});

storage.setItem(
  TEMPLATES_PAGE_STATE_STORAGE_KEY,
  JSON.stringify({
    search: 42,
    activeCategory: null,
    sortKey: 'unsupported',
  }),
);

assert.deepEqual(restoreTemplatesPageSnapshot(storage, fallback), fallback);

storage.setItem(TEMPLATES_PAGE_STATE_STORAGE_KEY, '{broken json');
assert.deepEqual(restoreTemplatesPageSnapshot(storage, fallback), fallback);
assert.equal(storage.getItem(TEMPLATES_PAGE_STATE_STORAGE_KEY), null);

const editorAiFallback: EditorAiPanelMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text: 'Ready',
  },
];
const editorAiKey = buildEditorAiPanelConversationStorageKey('template-a');
assert.deepEqual(restoreEditorAiPanelConversationMessages(null, editorAiKey, editorAiFallback), editorAiFallback);

persistEditorAiPanelConversationMessages(storage, editorAiKey, [
  ...editorAiFallback,
  {
    id: 'user-1',
    role: 'user',
    text: 'Make it brighter',
  },
  {
    id: 'assistant-streaming',
    role: 'assistant',
    text: 'Working',
    streaming: true,
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    text: 'Done',
  },
  {
    id: 'system-1',
    role: 'system',
    text: 'Internal status',
  },
]);

assert.deepEqual(restoreEditorAiPanelConversationMessages(storage, editorAiKey, editorAiFallback), [
  ...editorAiFallback,
  {
    id: 'user-1',
    role: 'user',
    text: 'Make it brighter',
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    text: 'Done',
  },
]);
assert.deepEqual(buildPersistedEditorAiPanelConversation(editorAiFallback), []);
assert.deepEqual(
  buildEditorAiPanelConversationContext([
    ...editorAiFallback,
    {
      id: 'user-1',
      role: 'user',
      text: '  Keep this context  ',
    },
  ]),
  [
    {
      role: 'user',
      content: 'Keep this context',
    },
  ],
);

storage.setItem(editorAiKey, JSON.stringify({ version: 999, messages: [] }));
assert.deepEqual(restoreEditorAiPanelConversationMessages(storage, editorAiKey, editorAiFallback), editorAiFallback);
assert.equal(storage.getItem(editorAiKey), null);

storage.setItem(editorAiKey, '{broken json');
assert.deepEqual(restoreEditorAiPanelConversationMessages(storage, editorAiKey, editorAiFallback), editorAiFallback);
assert.equal(storage.getItem(editorAiKey), null);

const editorBuilderUiFallback: EditorBuilderUiSnapshot = {
  sidebarTab: 'templates',
  interactionMode: 'edit',
  isExportDialogOpen: false,
  canvasScale: 1,
};
assert.deepEqual(restoreEditorBuilderUiSnapshot(null, editorBuilderUiFallback), editorBuilderUiFallback);
assert.deepEqual(restoreEditorBuilderUiSnapshot(storage, editorBuilderUiFallback), editorBuilderUiFallback);

persistEditorBuilderUiSnapshot(storage, {
  sidebarTab: 'components',
  interactionMode: 'preview',
  isExportDialogOpen: true,
  canvasScale: 0.72,
});

assert.deepEqual(restoreEditorBuilderUiSnapshot(storage, editorBuilderUiFallback), {
  sidebarTab: 'components',
  interactionMode: 'preview',
  isExportDialogOpen: false,
  canvasScale: 1,
});

storage.setItem(
  EDITOR_BUILDER_UI_STATE_STORAGE_KEY,
  JSON.stringify({
    sidebarTab: 'unsupported',
    interactionMode: 'unsupported',
    isExportDialogOpen: true,
    canvasScale: 0.5,
  }),
);
assert.deepEqual(restoreEditorBuilderUiSnapshot(storage, editorBuilderUiFallback), editorBuilderUiFallback);

storage.setItem(EDITOR_BUILDER_UI_STATE_STORAGE_KEY, '{broken json');
assert.deepEqual(restoreEditorBuilderUiSnapshot(storage, editorBuilderUiFallback), editorBuilderUiFallback);
assert.equal(storage.getItem(EDITOR_BUILDER_UI_STATE_STORAGE_KEY), null);

console.warn('State persistence smoke test passed.');
