/// <reference types="jest" />

import { Repository } from 'typeorm';

import { EditorAiConversation } from '../entities/editor-ai-conversation.entity';
import type { CreateEditorConversationInput } from './editor-conversation.repository';
import { TypeOrmEditorConversationRepository } from './typeorm-editor-conversation.repository';

function makeConversation(overrides: Partial<EditorAiConversation> = {}): EditorAiConversation {
  return Object.assign(new EditorAiConversation(), {
    id: 'conv-1',
    ownerUserId: 'owner-1',
    templateId: 'template-1',
    messages: [],
    providerMessages: [],
    providerSession: null,
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    updatedAt: new Date('2026-05-29T00:00:00.000Z'),
    ...overrides,
  });
}

function createRepoMock(): jest.Mocked<Repository<EditorAiConversation>> {
  return {
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    findOne: jest.fn(),
  } as unknown as jest.Mocked<Repository<EditorAiConversation>>;
}

describe('TypeOrmEditorConversationRepository', () => {
  it('delegates create to repo.create synchronously and returns its value', () => {
    const repo = createRepoMock();
    const input: CreateEditorConversationInput = {
      ownerUserId: 'owner-1',
      templateId: 'template-1',
    };
    const created = makeConversation();
    repo.create.mockReturnValue(created);
    const adapter = new TypeOrmEditorConversationRepository(repo);

    const result = adapter.create(input);

    expect(result).toBe(created);
    expect(repo.create.mock.calls).toEqual([[input]]);
  });

  it('delegates save to repo.save and propagates the resolved entity', async () => {
    const repo = createRepoMock();
    const conversation = makeConversation();
    const saved = makeConversation({ id: 'conv-saved' });
    repo.save.mockResolvedValue(saved);
    const adapter = new TypeOrmEditorConversationRepository(repo);

    await expect(adapter.save(conversation)).resolves.toBe(saved);
    expect(repo.save.mock.calls).toEqual([[conversation]]);
  });

  it('delegates remove to repo.remove and resolves void', async () => {
    const repo = createRepoMock();
    const conversation = makeConversation();
    repo.remove.mockResolvedValue(conversation);
    const adapter = new TypeOrmEditorConversationRepository(repo);

    await expect(adapter.remove(conversation)).resolves.toBeUndefined();
    expect(repo.remove.mock.calls).toEqual([[conversation]]);
  });

  it('findByOwnerAndTemplate delegates to repo.findOne with the correct where clause', async () => {
    const repo = createRepoMock();
    const found = makeConversation();
    repo.findOne.mockResolvedValue(found);
    const adapter = new TypeOrmEditorConversationRepository(repo);

    await expect(adapter.findByOwnerAndTemplate('owner-1', 'template-1')).resolves.toBe(found);
    expect(repo.findOne.mock.calls).toEqual([
      [{ where: { ownerUserId: 'owner-1', templateId: 'template-1' } }],
    ]);
  });

  it('findByOwnerAndTemplate propagates null when nothing matches', async () => {
    const repo = createRepoMock();
    repo.findOne.mockResolvedValue(null);
    const adapter = new TypeOrmEditorConversationRepository(repo);

    await expect(adapter.findByOwnerAndTemplate('owner-x', 'template-x')).resolves.toBeNull();
    expect(repo.findOne.mock.calls).toEqual([
      [{ where: { ownerUserId: 'owner-x', templateId: 'template-x' } }],
    ]);
  });
});
