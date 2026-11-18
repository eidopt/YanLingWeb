import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AiTokenUsageEvent } from '../ai/entities/aiTokenUsage.entity';
import type {
  CreateTokenUsageEventInput,
  TokenUsageRepository,
} from '../ai/repositories/tokenUsage.repository';
import { User } from './entities/user.entity';
import type { UserAccountRepository, UserAccountUpdate } from './repositories';
import { UsersService } from './users.service';

interface UserAccountPatchRecord {
  id: string;
  patch: UserAccountUpdate;
}

class FakeUserAccountRepository implements UserAccountRepository {
  readonly users = new Map<string, User>();
  updates: UserAccountPatchRecord[] = [];
  removed: string[] = [];

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  findByLoginIdentifier(): Promise<User | null> {
    return Promise.resolve(null);
  }

  findByRegistrationIdentity(): Promise<User | null> {
    return Promise.resolve(null);
  }

  findByOAuthOpenId(): Promise<User | null> {
    return Promise.resolve(null);
  }

  createLocalUser(): User {
    throw new Error('Not used by UsersService');
  }

  createOAuthUser(): User {
    throw new Error('Not used by UsersService');
  }

  save(user: User): Promise<User> {
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }

  update(id: string, patch: UserAccountUpdate): Promise<void> {
    this.updates.push({ id, patch });
    const user = this.users.get(id);
    if (user) {
      Object.assign(user, patch);
    }
    return Promise.resolve();
  }

  remove(user: User): Promise<void> {
    this.removed.push(user.id);
    this.users.delete(user.id);
    return Promise.resolve();
  }

  consumeFreeChatQuota(): Promise<boolean> {
    return Promise.resolve(true);
  }

  consumeFreeTemplateGenQuota(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

class FakeTokenUsageRepository implements TokenUsageRepository {
  events: AiTokenUsageEvent[] = [];

  recordEvent(input: CreateTokenUsageEventInput): Promise<AiTokenUsageEvent> {
    const event = createTokenUsageEvent(input);
    this.events.unshift(event);
    return Promise.resolve(event);
  }

  findForOwner(): Promise<AiTokenUsageEvent[]> {
    return Promise.resolve(this.events);
  }

  findCacheRecords(): Promise<AiTokenUsageEvent[]> {
    return Promise.resolve(this.events.filter((event) => event.cacheHitTokens !== null));
  }
}

function createUser(overrides: Partial<User> = {}): User {
  const now = new Date('2026-05-29T00:00:00.000Z');
  return Object.assign(new User(), {
    id: 'user-1',
    username: 'alice',
    email: 'alice@example.com',
    phone: null,
    passwordHash: '$2b$existing',
    wechatOpenId: null,
    qqOpenId: null,
    linkedLogins: ['local'],
    userType: 'normal',
    freeChatUsedCount: 0,
    freeTemplateGenUsedCount: 0,
    tokensUsed: 12,
    tokensBalance: 88,
    balanceCents: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    ...overrides,
  });
}

function createTokenUsageEvent(overrides: Partial<AiTokenUsageEvent> = {}): AiTokenUsageEvent {
  return Object.assign(new AiTokenUsageEvent(), {
    id: 'usage-1',
    ownerUserId: 'user-1',
    endpoint: 'editor',
    provider: 'openai',
    model: 'gpt-test',
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
    cacheHitTokens: 3,
    cacheMissTokens: 7,
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    ...overrides,
  });
}

function createService() {
  const userRepo = new FakeUserAccountRepository();
  const tokenRepo = new FakeTokenUsageRepository();
  const service = new UsersService(userRepo, tokenRepo);
  return { service, userRepo, tokenRepo };
}

describe('UsersService', () => {
  it('reads a user through the account repository port', async () => {
    const { service, userRepo } = createService();
    userRepo.users.set('user-1', createUser());

    await expect(service.findById('user-1')).resolves.toMatchObject({
      id: 'user-1',
      username: 'alice',
      tokensUsed: 12,
    });
  });

  it('throws when account repository cannot find the user', async () => {
    const { service } = createService();

    await expect(service.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('summarizes token usage after loading the owner through the account repository', async () => {
    const { service, userRepo, tokenRepo } = createService();
    userRepo.users.set('user-1', createUser());
    tokenRepo.events = [
      createTokenUsageEvent({ id: 'usage-1', inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
      createTokenUsageEvent({ id: 'usage-2', inputTokens: 2, outputTokens: 8, totalTokens: 10 }),
    ];

    await expect(service.getTokenUsageSummary('user-1')).resolves.toMatchObject({
      ownerUserId: 'user-1',
      inputTokens: 12,
      outputTokens: 13,
      recordedTokens: 25,
      requestCount: 2,
    });
  });

  it('requires current password before changing password', async () => {
    const { service, userRepo } = createService();
    userRepo.users.set('user-1', createUser());

    await expect(service.update('user-1', { password: 'new-hash' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('removes a user through the account repository port', async () => {
    const { service, userRepo } = createService();
    userRepo.users.set('user-1', createUser());

    await service.remove('user-1');

    expect(userRepo.removed).toEqual(['user-1']);
    expect(userRepo.users.has('user-1')).toBe(false);
  });
});
