import { NotFoundException } from '@nestjs/common';

import type { TemplateReadRepository } from '../../templates/repositories/templateRead.repository';
import { EditorAiConversation } from '../entities/editorAiConversation.entity';
import type {
  CreateEditorConversationInput,
  EditorConversationRepository,
} from '../repositories/editorConversation.repository';
import { EditorConversationService } from './editorConversation.service';
import { ProviderLogCompactionService } from './providerLogCompaction.service';

class FakeEditorConversationRepository implements EditorConversationRepository {
  readonly conversations = new Map<string, EditorAiConversation>();
  removed: string[] = [];

  create(input: CreateEditorConversationInput): EditorAiConversation {
    return createConversation(input);
  }

  save(conversation: EditorAiConversation): Promise<EditorAiConversation> {
    conversation.updatedAt = new Date('2026-05-29T01:00:00.000Z');
    this.conversations.set(keyFor(conversation.ownerUserId, conversation.templateId), conversation);
    return Promise.resolve(conversation);
  }

  remove(conversation: EditorAiConversation): Promise<void> {
    this.removed.push(conversation.templateId);
    this.conversations.delete(keyFor(conversation.ownerUserId, conversation.templateId));
    return Promise.resolve();
  }

  findByOwnerAndTemplate(
    ownerUserId: string,
    templateId: string,
  ): Promise<EditorAiConversation | null> {
    return Promise.resolve(this.conversations.get(keyFor(ownerUserId, templateId)) ?? null);
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
    if (!this.accessible.has(keyFor(ownerUserId, templateId))) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ templateId, sourceTemplateId: null });
  }
}

function keyFor(ownerUserId: string, templateId: string): string {
  return `${ownerUserId}:${templateId}`;
}

function createConversation(
  overrides: Partial<EditorAiConversation> & CreateEditorConversationInput,
): EditorAiConversation {
  const now = new Date('2026-05-29T00:00:00.000Z');
  const { ownerUserId, templateId, ...rest } = overrides;
  return Object.assign(new EditorAiConversation(), {
    id: `conversation-${templateId}`,
    ownerUserId,
    templateId,
    messages: [],
    providerMessages: [],
    providerSession: null,
    createdAt: now,
    updatedAt: now,
    ...rest,
  });
}

function createService() {
  const conversations = new FakeEditorConversationRepository();
  const templates = new FakeTemplateReadRepository();
  const compaction = new ProviderLogCompactionService();
  const service = new EditorConversationService(conversations, templates, compaction);
  templates.accessible.add(keyFor('user-1', 'template-1'));
  return { service, conversations, templates };
}

describe('EditorConversationService repository boundary', () => {
  it('extracts the template id from editor conversation ids', () => {
    expect(
      EditorConversationService.templateIdFromConversationId('editor-template-demo%2Fone'),
    ).toBe('demo/one');
    expect(EditorConversationService.templateIdFromConversationId('other-demo')).toBeNull();
  });

  it('saves normalized conversation messages through the repository port', async () => {
    const { service, conversations } = createService();
    const longContent = 'x'.repeat(40_010);

    await expect(
      service.saveEditorConversation('user-1', 'template-1', {
        messages: [
          { role: 'system', content: 'ignored' },
          { role: 'user', content: '  hello  ' },
          { role: 'assistant', content: longContent },
        ],
      }),
    ).resolves.toMatchObject({
      templateId: 'template-1',
      messages: [{ role: 'user', content: 'hello' }, { role: 'assistant' }],
      updatedAt: '2026-05-29T01:00:00.000Z',
    });

    const saved = conversations.conversations.get(keyFor('user-1', 'template-1'));
    expect(saved?.messages[1]?.content).toHaveLength('[Earlier content omitted]\n'.length + 40_000);
  });

  it('removes an existing conversation when normalized messages are empty', async () => {
    const { service, conversations } = createService();
    conversations.conversations.set(
      keyFor('user-1', 'template-1'),
      createConversation({
        ownerUserId: 'user-1',
        templateId: 'template-1',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    );

    await expect(
      service.saveEditorConversation('user-1', 'template-1', { messages: [] }),
    ).resolves.toEqual({
      templateId: 'template-1',
      messages: [],
      updatedAt: null,
    });
    expect(conversations.removed).toEqual(['template-1']);
  });

  it('persists and reloads provider sessions through the repository port', async () => {
    const { service } = createService();
    const conversationId = 'editor-template-template-1';

    await service.saveEditorProviderSession(
      'user-1',
      conversationId,
      'gpt-test',
      'openai',
      'response-1',
    );

    await expect(
      service.loadEditorProviderSession('user-1', conversationId, 'gpt-test', 'openai'),
    ).resolves.toMatchObject({
      provider: 'openai',
      model: 'gpt-test',
      conversationId,
      previousResponseId: 'response-1',
    });
    await expect(
      service.loadEditorProviderSession('user-1', conversationId, 'gpt-test', 'openaiCompatible'),
    ).resolves.toBeNull();
  });

  it('throws when a template is not accessible', async () => {
    const { service } = createService();

    await expect(service.getEditorConversation('user-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
