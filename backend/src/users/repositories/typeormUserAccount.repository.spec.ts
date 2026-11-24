/// <reference types="jest" />

import type { Repository } from 'typeorm';

import { User } from '../entities/user.entity';
import { TypeOrmUserAccountRepository } from './typeormUserAccount.repository';
import type {
  CreateLocalUserInput,
  CreateOAuthUserInput,
  FindRegistrationIdentityInput,
  UserAccountUpdate,
} from './userAccount.repository';

function makeUser(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'user-1',
    username: 'alice',
    email: 'alice@example.com',
    phone: '13800000000',
    passwordHash: 'hash',
    wechatOpenId: null,
    qqOpenId: null,
    linkedLogins: ['local'],
    userType: 'normal',
    freeChatUsedCount: 0,
    freeTemplateGenUsedCount: 0,
    tokensUsed: '0',
    tokensBalance: 0,
    balanceCents: 0,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    updatedAt: new Date('2026-05-29T00:00:00.000Z'),
    ...overrides,
  });
}

function createRepoMock(): jest.Mocked<Repository<User>> {
  return {
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  } as unknown as jest.Mocked<Repository<User>>;
}

describe('TypeOrmUserAccountRepository', () => {
  describe('findById', () => {
    it('delegates to findOne with an id where-clause and resolves the result', async () => {
      const repo = createRepoMock();
      const user = makeUser();
      repo.findOne.mockResolvedValue(user);
      const adapter = new TypeOrmUserAccountRepository(repo);

      await expect(adapter.findById('user-1')).resolves.toBe(user);
      expect(repo.findOne.mock.calls).toEqual([[{ where: { id: 'user-1' } }]]);
    });

    it('resolves null when no user matches', async () => {
      const repo = createRepoMock();
      repo.findOne.mockResolvedValue(null);
      const adapter = new TypeOrmUserAccountRepository(repo);

      await expect(adapter.findById('missing')).resolves.toBeNull();
    });
  });

  describe('findByLoginIdentifier', () => {
    it('builds an OR where-array across username, email and phone', async () => {
      const repo = createRepoMock();
      const user = makeUser();
      repo.findOne.mockResolvedValue(user);
      const adapter = new TypeOrmUserAccountRepository(repo);

      await expect(adapter.findByLoginIdentifier('alice')).resolves.toBe(user);
      expect(repo.findOne.mock.calls).toEqual([
        [{ where: [{ username: 'alice' }, { email: 'alice' }, { phone: 'alice' }] }],
      ]);
    });
  });

  describe('findByRegistrationIdentity', () => {
    it('includes only username when email and phone are absent', async () => {
      const repo = createRepoMock();
      repo.findOne.mockResolvedValue(null);
      const adapter = new TypeOrmUserAccountRepository(repo);
      const input: FindRegistrationIdentityInput = { username: 'alice' };

      await expect(adapter.findByRegistrationIdentity(input)).resolves.toBeNull();
      expect(repo.findOne.mock.calls).toEqual([[{ where: [{ username: 'alice' }] }]]);
    });

    it('appends email and phone conditions when present', async () => {
      const repo = createRepoMock();
      const user = makeUser();
      repo.findOne.mockResolvedValue(user);
      const adapter = new TypeOrmUserAccountRepository(repo);
      const input: FindRegistrationIdentityInput = {
        username: 'alice',
        email: 'alice@example.com',
        phone: '13800000000',
      };

      await expect(adapter.findByRegistrationIdentity(input)).resolves.toBe(user);
      expect(repo.findOne.mock.calls).toEqual([
        [
          {
            where: [
              { username: 'alice' },
              { email: 'alice@example.com' },
              { phone: '13800000000' },
            ],
          },
        ],
      ]);
    });

    it('appends only email when phone is absent', async () => {
      const repo = createRepoMock();
      repo.findOne.mockResolvedValue(null);
      const adapter = new TypeOrmUserAccountRepository(repo);
      const input: FindRegistrationIdentityInput = {
        username: 'alice',
        email: 'alice@example.com',
      };

      await adapter.findByRegistrationIdentity(input);
      expect(repo.findOne.mock.calls).toEqual([
        [{ where: [{ username: 'alice' }, { email: 'alice@example.com' }] }],
      ]);
    });
  });

  describe('findByOAuthOpenId', () => {
    it('queries wechatOpenId for the wechat provider', async () => {
      const repo = createRepoMock();
      const user = makeUser({ wechatOpenId: 'wx-123' });
      repo.findOne.mockResolvedValue(user);
      const adapter = new TypeOrmUserAccountRepository(repo);

      await expect(adapter.findByOAuthOpenId('wechat', 'wx-123')).resolves.toBe(user);
      expect(repo.findOne.mock.calls).toEqual([[{ where: { wechatOpenId: 'wx-123' } }]]);
    });

    it('queries qqOpenId for the qq provider', async () => {
      const repo = createRepoMock();
      const user = makeUser({ qqOpenId: 'qq-456' });
      repo.findOne.mockResolvedValue(user);
      const adapter = new TypeOrmUserAccountRepository(repo);

      await expect(adapter.findByOAuthOpenId('qq', 'qq-456')).resolves.toBe(user);
      expect(repo.findOne.mock.calls).toEqual([[{ where: { qqOpenId: 'qq-456' } }]]);
    });
  });

  describe('createLocalUser', () => {
    it('maps input to create() with linkedLogins=[local] and returns the entity sync', () => {
      const repo = createRepoMock();
      const created = makeUser();
      repo.create.mockReturnValue(created);
      const adapter = new TypeOrmUserAccountRepository(repo);
      const input: CreateLocalUserInput = {
        username: 'alice',
        email: 'alice@example.com',
        phone: '13800000000',
        passwordHash: 'hash',
      };

      expect(adapter.createLocalUser(input)).toBe(created);
      expect(repo.create.mock.calls).toEqual([
        [
          {
            username: 'alice',
            email: 'alice@example.com',
            phone: '13800000000',
            passwordHash: 'hash',
            passwordSeal: null,
            linkedLogins: ['local'],
            userType: 'normal',
            freeChatUsedCount: 0,
            freeTemplateGenUsedCount: 0,
            tokensBalance: 1_000_000,
            isAdmin: false,
          },
        ],
      ]);
    });
  });

  describe('createOAuthUser', () => {
    it('maps a wechat user to create() with wechatOpenId and nulled local fields', () => {
      const repo = createRepoMock();
      const created = makeUser({ email: null, phone: null, passwordHash: null });
      repo.create.mockReturnValue(created);
      const adapter = new TypeOrmUserAccountRepository(repo);
      const input: CreateOAuthUserInput = {
        provider: 'wechat',
        openId: 'wx-123',
        username: 'wx-alice',
      };

      expect(adapter.createOAuthUser(input)).toBe(created);
      expect(repo.create.mock.calls).toEqual([
        [
          {
            username: 'wx-alice',
            email: null,
            phone: null,
            passwordHash: null,
            passwordSeal: null,
            wechatOpenId: 'wx-123',
            linkedLogins: ['wechat'],
            userType: 'normal',
            freeChatUsedCount: 0,
            freeTemplateGenUsedCount: 0,
            tokensBalance: 1_000_000,
            isAdmin: false,
          },
        ],
      ]);
    });

    it('maps a qq user to create() with qqOpenId and nulled local fields', () => {
      const repo = createRepoMock();
      const created = makeUser({ email: null, phone: null, passwordHash: null });
      repo.create.mockReturnValue(created);
      const adapter = new TypeOrmUserAccountRepository(repo);
      const input: CreateOAuthUserInput = {
        provider: 'qq',
        openId: 'qq-456',
        username: 'qq-alice',
      };

      expect(adapter.createOAuthUser(input)).toBe(created);
      expect(repo.create.mock.calls).toEqual([
        [
          {
            username: 'qq-alice',
            email: null,
            phone: null,
            passwordHash: null,
            passwordSeal: null,
            qqOpenId: 'qq-456',
            linkedLogins: ['qq'],
            userType: 'normal',
            freeChatUsedCount: 0,
            freeTemplateGenUsedCount: 0,
            tokensBalance: 1_000_000,
            isAdmin: false,
          },
        ],
      ]);
    });
  });

  describe('save', () => {
    it('delegates to repo.save and resolves the persisted entity', async () => {
      const repo = createRepoMock();
      const user = makeUser();
      const saved = makeUser({ id: 'user-1', username: 'alice-saved' });
      repo.save.mockResolvedValue(saved);
      const adapter = new TypeOrmUserAccountRepository(repo);

      await expect(adapter.save(user)).resolves.toBe(saved);
      expect(repo.save.mock.calls).toEqual([[user]]);
    });
  });

  describe('update', () => {
    it('delegates to repo.update with id and patch and resolves void', async () => {
      const repo = createRepoMock();
      repo.update.mockResolvedValue({} as Awaited<ReturnType<Repository<User>['update']>>);
      const adapter = new TypeOrmUserAccountRepository(repo);
      const patch: UserAccountUpdate = { username: 'renamed', email: 'new@example.com' };

      await expect(adapter.update('user-1', patch)).resolves.toBeUndefined();
      expect(repo.update.mock.calls).toEqual([['user-1', patch]]);
    });
  });

  describe('remove', () => {
    it('delegates to repo.remove and resolves void', async () => {
      const repo = createRepoMock();
      const user = makeUser();
      repo.remove.mockResolvedValue(user);
      const adapter = new TypeOrmUserAccountRepository(repo);

      await expect(adapter.remove(user)).resolves.toBeUndefined();
      expect(repo.remove.mock.calls).toEqual([[user]]);
    });
  });
});
