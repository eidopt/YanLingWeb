/// <reference types="jest" />

import { NotFoundException } from '@nestjs/common';
import type { EditorUndoSnapshot } from '@shared/agent/contracts/editorUndoStack';

import type { TemplateReadRepository } from '../../templates/repositories/templateRead.repository';
import { EditorAiConversation } from '../entities/editorAiConversation.entity';
import type {
  CreateEditorConversationInput,
  EditorConversationRepository,
} from '../repositories/editorConversation.repository';
import { EditorConversationService } from './editorConversation.service';
import { ProviderLogCompactionService } from './providerLogCompaction.service';

class InMemoryEditorConversationRepository implements EditorConversationRepository {
  readonly conversations = new Map<string, EditorAiConversation>();
  removed: string[] = [];

  create(input: CreateEditorConversationInput): EditorAiConversation {
    const now = new Date('2026-06-10T00:00:00.000Z');
    const conversation = Object.assign(new EditorAiConversation(), {
      id: `conversation-${input.templateId}`,
      ownerUserId: input.ownerUserId,
      templateId: input.templateId,
      messages: input.messages ?? [],
      providerMessages: input.providerMessages ?? [],
      providerSession: input.providerSession ?? null,
      undoStack: input.undoStack ?? null,
      createdAt: now,
      updatedAt: now,
    });
    return conversation;
  }

  async save(conversation: EditorAiConversation): Promise<EditorAiConversation> {
    conversation.updatedAt = new Date('2026-06-10T01:00:00.000Z');
    await Promise.resolve();
    this.conversations.set(`${conversation.ownerUserId}:${conversation.templateId}`, conversation);
    return conversation;
  }

  async remove(conversation: EditorAiConversation): Promise<void> {
    await Promise.resolve();
    this.removed.push(conversation.templateId);
    this.conversations.delete(`${conversation.ownerUserId}:${conversation.templateId}`);
  }

  async findByOwnerAndTemplate(
    ownerUserId: string,
    templateId: string,
  ): Promise<EditorAiConversation | null> {
    await Promise.resolve();
    return this.conversations.get(`${ownerUserId}:${templateId}`) ?? null;
  }
}

class FakeTemplateReadRepository implements TemplateReadRepository {
  readonly accessible = new Set<string>();

  searchPublicTemplates(): Promise<[]> {
    return Promise.resolve([]);
  }

  findDiversitySummaries(): Promise<[]> {
    return Promise.resolve([]);
  }

  findOwnedPublishSnapshot(): Promise<null> {
    return Promise.resolve(null);
  }

  findAccessibleIdentity(ownerUserId: string, templateId: string) {
    if (!this.accessible.has(`${ownerUserId}:${templateId}`)) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ templateId, sourceTemplateId: null });
  }
}

function keyFor(ownerUserId: string, templateId: string): string {
  return `${ownerUserId}:${templateId}`;
}

function createService() {
  const repo = new InMemoryEditorConversationRepository();
  const templates = new FakeTemplateReadRepository();
  const compaction = new ProviderLogCompactionService();
  const service = new EditorConversationService(repo, templates, compaction);
  templates.accessible.add(keyFor('user-1', 'template-1'));
  return { service, repo, templates };
}

function makeSnapshot(overrides: Partial<EditorUndoSnapshot> = {}): EditorUndoSnapshot {
  return {
    id: 'snapshot-1',
    document: {
      version: 1,
      themeId: 'theme-a',
      themeName: 'Theme A',
      description: 'desc',
      components: [],
      pages: [],
      defaultPageId: 'page-1',
      layout: {
        id: 'root',
        alias: 'core.stack',
        layout: { mode: 'flow' },
        children: [],
      },
    },
    description: 'applied edit',
    createdAt: '2026-06-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('EditorConversationService undo stack persistence', () => {
  it('persists the undo stack alongside messages and returns it on load', async () => {
    const { service, repo } = createService();
    const undoStack = {
      maxSize: 20,
      entries: [makeSnapshot({ id: 'snapshot-a' }), makeSnapshot({ id: 'snapshot-b' })],
    };

    const saveResult = await service.saveEditorConversation('user-1', 'template-1', {
      messages: [{ role: 'user', content: 'hi' }],
      undoStack,
    });

    expect(saveResult.undoStack).toEqual(undoStack);

    const stored = repo.conversations.get(keyFor('user-1', 'template-1'));
    expect(stored?.undoStack).toEqual(undoStack);

    const loaded = await service.getEditorConversation('user-1', 'template-1');
    expect(loaded.undoStack).toEqual(undoStack);
    expect(loaded.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('loads an existing undo stack when the caller only updates messages', async () => {
    const { service, repo } = createService();
    const initialStack = {
      maxSize: 20,
      entries: [makeSnapshot({ id: 'snapshot-pre' })],
    };
    await service.saveEditorConversation('user-1', 'template-1', {
      messages: [{ role: 'user', content: 'one' }],
      undoStack: initialStack,
    });

    const stored = repo.conversations.get(keyFor('user-1', 'template-1'));
    if (!stored) {
      throw new Error('conversation should have been persisted');
    }
    const messagesLengthBefore = stored.messages.length;
    expect(stored.undoStack).toEqual(initialStack);

    const result = await service.saveEditorConversation('user-1', 'template-1', {
      messages: [
        { role: 'user', content: 'one' },
        { role: 'assistant', content: 'reply' },
      ],
    });

    // The same row was re-saved (because messages changed), and the previously
    // stored undo stack is preserved when the caller omits `undoStack` from the input.
    expect(result.undoStack).toEqual(initialStack);
    expect(stored.messages.length).toBe(messagesLengthBefore + 1);
    expect(stored.undoStack).toEqual(initialStack);
  });

  it('persists the undo stack even when messages are empty', async () => {
    const { service } = createService();
    const undoStack = {
      maxSize: 10,
      entries: [makeSnapshot()],
    };

    const saveResult = await service.saveEditorConversation('user-1', 'template-1', {
      messages: [],
      undoStack,
    });

    expect(saveResult.messages).toEqual([]);
    expect(saveResult.undoStack).toEqual(undoStack);
    expect(saveResult.updatedAt).not.toBeNull();

    const loaded = await service.getEditorConversation('user-1', 'template-1');
    expect(loaded.undoStack).toEqual(undoStack);
  });

  it('clears the undo stack when the caller persists explicit null', async () => {
    const { service, repo } = createService();
    await service.saveEditorConversation('user-1', 'template-1', {
      messages: [{ role: 'user', content: 'hi' }],
      undoStack: { entries: [makeSnapshot()] },
    });

    const result = await service.saveEditorConversation('user-1', 'template-1', {
      messages: [{ role: 'user', content: 'hi' }],
      undoStack: null,
    });

    expect(result.undoStack).toBeNull();
    const stored = repo.conversations.get(keyFor('user-1', 'template-1'));
    expect(stored?.undoStack).toBeNull();
  });

  it('removes the conversation when both messages and undo stack are empty', async () => {
    const { service, repo } = createService();
    await service.saveEditorConversation('user-1', 'template-1', {
      messages: [{ role: 'user', content: 'hi' }],
      undoStack: { entries: [makeSnapshot()] },
    });
    expect(repo.conversations.has(keyFor('user-1', 'template-1'))).toBe(true);

    const result = await service.saveEditorConversation('user-1', 'template-1', {
      messages: [],
      undoStack: null,
    });

    expect(result.messages).toEqual([]);
    expect(result.undoStack).toBeNull();
    expect(result.updatedAt).toBeNull();
    expect(repo.removed).toContain('template-1');
  });

  it('drops invalid undo stack payloads and stores null', async () => {
    const { service } = createService();
    const result = await service.saveEditorConversation('user-1', 'template-1', {
      messages: [{ role: 'user', content: 'hi' }],
      undoStack: 'not-an-object' as unknown as never,
    });

    expect(result.undoStack).toBeNull();
  });

  it('returns null undo stack when the conversation does not exist yet', async () => {
    const { service } = createService();
    const loaded = await service.getEditorConversation('user-1', 'template-1');
    expect(loaded.undoStack).toBeNull();
    expect(loaded.messages).toEqual([]);
    expect(loaded.updatedAt).toBeNull();
  });

  it('throws when a template is not accessible', async () => {
    const { service } = createService();
    await expect(
      service.saveEditorConversation('user-1', 'missing', {
        undoStack: { entries: [makeSnapshot()] },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('drops entries that exceed MAX_EDITOR_UNDO_STACK_TOTAL_CHARS', async () => {
    const { service, repo } = createService();
    // Build a small entry, then a snapshot whose serialized JSON pushes the
    // running total over 1MB on its own. The huge entry must be dropped
    // because it would push the running total over the cap.
    const firstEntry = makeSnapshot({ id: 'first' });
    const hugeDoc = {
      version: 1,
      themeId: 'huge',
      themeName: 'Huge',
      description: 'huge',
      components: [],
      pages: [],
      defaultPageId: 'page-1',
      layout: { id: 'root', alias: 'core.stack', layout: { mode: 'flow' }, children: [] },
      cssVars: { x: 'A'.repeat(2_000_000) },
    };
    const hugeEntry = makeSnapshot({
      id: 'huge',
      document: hugeDoc as unknown as EditorUndoSnapshot['document'],
      description: 'huge',
    });

    await service.saveEditorConversation('user-1', 'template-1', {
      messages: [{ role: 'user', content: 'hi' }],
      undoStack: { entries: [firstEntry, hugeEntry] },
    });

    const stored = repo.conversations.get(keyFor('user-1', 'template-1'));
    if (!stored?.undoStack) {
      throw new Error('undo stack should have been persisted');
    }
    const persistedEntries = stored.undoStack.entries ?? [];
    // The huge entry must be dropped because it would push the running total
    // over MAX_EDITOR_UNDO_STACK_TOTAL_CHARS; the small entry before it
    // must be retained.
    expect(persistedEntries.length).toBe(1);
    expect(persistedEntries[0]?.id).toBe('first');
  });
});
