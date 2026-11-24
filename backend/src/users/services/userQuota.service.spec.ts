import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { User } from '../entities/user.entity';
import type {
  CreateLocalUserInput,
  CreateOAuthUserInput,
  FindRegistrationIdentityInput,
  UserAccountRepository,
  UserAccountUpdate,
} from '../repositories';
import {
  FREE_CHAT_QUOTA_EXCEEDED_CODE,
  FREE_TEMPLATE_QUOTA_EXCEEDED_CODE,
  NORMAL_USER_FREE_CHAT_LIMIT,
  NORMAL_USER_FREE_TEMPLATE_GEN_LIMIT,
  UserQuotaService,
} from './userQuota.service';

class InMemoryQuotaUserRepository implements UserAccountRepository {
  readonly users = new Map<string, User>();

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  findByLoginIdentifier(): Promise<User | null> {
    return Promise.resolve(null);
  }

  findByRegistrationIdentity(_input: FindRegistrationIdentityInput): Promise<User | null> {
    return Promise.resolve(null);
  }

  findByOAuthOpenId(): Promise<User | null> {
    return Promise.resolve(null);
  }

  createLocalUser(_input: CreateLocalUserInput): User {
    throw new Error('unused');
  }

  createOAuthUser(_input: CreateOAuthUserInput): User {
    throw new Error('unused');
  }

  save(user: User): Promise<User> {
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }

  update(_id: string, _patch: UserAccountUpdate): Promise<void> {
    return Promise.resolve();
  }

  remove(_user: User): Promise<void> {
    return Promise.resolve();
  }

  consumeFreeChatQuota(userId: string, limit: number): Promise<boolean> {
    const user = this.users.get(userId);
    if (user?.userType !== 'normal' || user.freeChatUsedCount >= limit) {
      return Promise.resolve(false);
    }
    user.freeChatUsedCount += 1;
    return Promise.resolve(true);
  }

  consumeFreeTemplateGenQuota(userId: string, limit: number): Promise<boolean> {
    const user = this.users.get(userId);
    if (user?.userType !== 'normal' || user.freeTemplateGenUsedCount >= limit) {
      return Promise.resolve(false);
    }
    user.freeTemplateGenUsedCount += 1;
    return Promise.resolve(true);
  }

  releaseFreeChatQuota(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user?.userType === 'normal' && user.freeChatUsedCount > 0) {
      user.freeChatUsedCount -= 1;
    }
    return Promise.resolve();
  }

  releaseFreeTemplateGenQuota(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user?.userType === 'normal' && user.freeTemplateGenUsedCount > 0) {
      user.freeTemplateGenUsedCount -= 1;
    }
    return Promise.resolve();
  }

  debitTokens(userId: string, totalTokens: number): Promise<number> {
    const user = this.users.get(userId);
    if (!user) {
      return Promise.resolve(0);
    }
    const amount = Math.max(0, Math.floor(totalTokens));
    user.tokensUsed = (BigInt(user.tokensUsed) + BigInt(amount)).toString();
    user.tokensBalance = Math.max(0, user.tokensBalance - amount);
    return Promise.resolve(user.tokensBalance);
  }

  listIds(): Promise<string[]> {
    return Promise.resolve([...this.users.keys()]);
  }
}

function makeUser(overrides: Partial<User> = {}): User {
  const now = new Date('2026-11-18T00:00:00.000Z');
  return Object.assign(new User(), {
    id: 'user-1',
    username: 'alice',
    email: 'alice@example.com',
    phone: null,
    passwordHash: 'hash',
    wechatOpenId: null,
    qqOpenId: null,
    linkedLogins: ['local'],
    userType: 'normal',
    freeChatUsedCount: 0,
    freeTemplateGenUsedCount: 0,
    tokensUsed: '0',
    tokensBalance: 1_000_000,
    balanceCents: 0,
    isActive: true,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('UserQuotaService', () => {
  it('allows 3 free chats for normal users and rejects the 4th with recharge prompt', async () => {
    const repo = new InMemoryQuotaUserRepository();
    repo.users.set('user-1', makeUser({ userType: 'normal' }));
    const service = new UserQuotaService(repo);

    for (let i = 0; i < NORMAL_USER_FREE_CHAT_LIMIT; i += 1) {
      await expect(service.consumeFreeChatQuota('user-1')).resolves.toBeUndefined();
    }
    expect(repo.users.get('user-1')?.freeChatUsedCount).toBe(3);

    await expect(service.consumeFreeChatQuota('user-1')).rejects.toThrow(ForbiddenException);
    try {
      await service.consumeFreeChatQuota('user-1');
    } catch (err) {
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        code: FREE_CHAT_QUOTA_EXCEEDED_CODE,
        message: expect.stringContaining('无法继续生成') as string,
      });
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        message: expect.stringContaining('充值') as string,
      });
    }
  });

  it('allows 1 free template generation for normal users and rejects the 2nd', async () => {
    const repo = new InMemoryQuotaUserRepository();
    repo.users.set('user-1', makeUser({ userType: 'normal' }));
    const service = new UserQuotaService(repo);

    for (let i = 0; i < NORMAL_USER_FREE_TEMPLATE_GEN_LIMIT; i += 1) {
      await expect(service.consumeFreeTemplateGenQuota('user-1')).resolves.toBeUndefined();
    }
    expect(repo.users.get('user-1')?.freeTemplateGenUsedCount).toBe(1);

    await expect(service.consumeFreeTemplateGenQuota('user-1')).rejects.toThrow(ForbiddenException);
    try {
      await service.consumeFreeTemplateGenQuota('user-1');
    } catch (err) {
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        code: FREE_TEMPLATE_QUOTA_EXCEEDED_CODE,
        message: expect.stringContaining('充值') as string,
      });
    }
  });

  it('does not limit chat or template counts for pro users who still have tokens', async () => {
    const repo = new InMemoryQuotaUserRepository();
    repo.users.set(
      'user-pro',
      makeUser({ id: 'user-pro', userType: 'pro', tokensBalance: 1_000_000 }),
    );
    const service = new UserQuotaService(repo);

    for (let i = 0; i < 10; i += 1) {
      await expect(service.consumeFreeChatQuota('user-pro')).resolves.toBeUndefined();
      await expect(service.consumeFreeTemplateGenQuota('user-pro')).resolves.toBeUndefined();
    }
    expect(repo.users.get('user-pro')?.freeChatUsedCount).toBe(0);
    expect(repo.users.get('user-pro')?.freeTemplateGenUsedCount).toBe(0);
  });

  it('prevents concurrent requests from exceeding free quota', async () => {
    const repo = new InMemoryQuotaUserRepository();
    repo.users.set('user-1', makeUser({ userType: 'normal' }));
    const service = new UserQuotaService(repo);

    const chatResults = await Promise.allSettled([
      service.consumeFreeChatQuota('user-1'),
      service.consumeFreeChatQuota('user-1'),
      service.consumeFreeChatQuota('user-1'),
      service.consumeFreeChatQuota('user-1'),
      service.consumeFreeChatQuota('user-1'),
    ]);
    expect(chatResults.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(chatResults.filter((r) => r.status === 'rejected')).toHaveLength(2);

    const tplResults = await Promise.allSettled([
      service.consumeFreeTemplateGenQuota('user-1'),
      service.consumeFreeTemplateGenQuota('user-1'),
      service.consumeFreeTemplateGenQuota('user-1'),
    ]);
    expect(tplResults.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(tplResults.filter((r) => r.status === 'rejected')).toHaveLength(2);
  });

  it('throws NotFoundException when the user does not exist', async () => {
    const repo = new InMemoryQuotaUserRepository();
    const service = new UserQuotaService(repo);

    await expect(service.consumeFreeChatQuota('missing')).rejects.toThrow(NotFoundException);
    await expect(service.consumeFreeTemplateGenQuota('missing')).rejects.toThrow(NotFoundException);
  });

  it('rejects generation when the token balance is empty, even if free counts remain', async () => {
    const repo = new InMemoryQuotaUserRepository();
    repo.users.set('user-1', makeUser({ tokensBalance: 0, freeChatUsedCount: 0 }));
    const service = new UserQuotaService(repo);

    await expect(service.consumeFreeChatQuota('user-1')).rejects.toThrow(ForbiddenException);
    try {
      await service.assertTokenBalance('user-1');
      throw new Error('expected token balance rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        code: 'TOKEN_BALANCE_EXHAUSTED',
        message: expect.stringContaining('Token 已用完') as string,
      });
    }
    expect(repo.users.get('user-1')?.freeChatUsedCount).toBe(0);
  });

  it('skips a verified clarification follow-up but still requires tokens', async () => {
    const repo = new InMemoryQuotaUserRepository();
    repo.users.set('user-1', makeUser({ freeChatUsedCount: 3, tokensBalance: 50 }));
    const service = new UserQuotaService(repo);

    await expect(
      service.consumeFreeChatQuota('user-1', { countExempt: true }),
    ).resolves.toBeUndefined();
    expect(repo.users.get('user-1')?.freeChatUsedCount).toBe(3);

    await expect(service.consumeFreeChatQuota('user-1')).rejects.toThrow(ForbiddenException);
  });
});
