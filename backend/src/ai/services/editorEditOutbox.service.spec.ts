import { DataSource } from 'typeorm';

import { EditorEditOutboxEntry } from '../entities/editorEditOutbox.entity';
import { EditorEditOutbox } from './editorEditOutbox.service';

describe('EditorEditOutbox', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [EditorEditOutboxEntry],
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('lets a second instance read an edit once for its owner', async () => {
    const repository = dataSource.getRepository(EditorEditOutboxEntry);
    const writer = new EditorEditOutbox(repository);
    const reader = new EditorEditOutbox(repository);
    const editId = await writer.put('user-1', '{"operations":[]}');

    expect(await reader.take('user-2', editId)).toBeNull();
    expect(await reader.take('user-1', editId)).toBe('{"operations":[]}');
    expect(await writer.take('user-1', editId)).toBeNull();
  });

  it('drops expired edits before they can be read', async () => {
    const repository = dataSource.getRepository(EditorEditOutboxEntry);
    const outbox = new EditorEditOutbox(repository);
    await repository.insert({
      id: '11111111-1111-4111-8111-111111111111',
      ownerUserId: 'user-1',
      body: 'stale',
      expiresAt: '1',
    });

    expect(await outbox.take('user-1', '11111111-1111-4111-8111-111111111111')).toBeNull();
  });

  it('rejects edit ids that are not uuids', async () => {
    const outbox = new EditorEditOutbox(dataSource.getRepository(EditorEditOutboxEntry));

    expect(await outbox.take('user-1', '../secrets')).toBeNull();
  });
});
