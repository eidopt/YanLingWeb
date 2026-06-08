import { User } from '../../users/entities/user.entity';
import type {
  CreateLocalUserInput,
  CreateOAuthUserInput,
  FindRegistrationIdentityInput,
  OAuthProvider,
  UserAccountRepository,
  UserAccountUpdate,
} from '../../users/repositories';
import { AiTokenUsageEvent } from '../entities/aiTokenUsage.entity';
import type {
  CreateTokenUsageEventInput,
  TokenUsageRepository,
} from '../repositories/tokenUsage.repository';
import { TokenUsageService } from './tokenUsage.service';

class FakeTokenUsageRepository implements TokenUsageRepository {
  readonly records: AiTokenUsageEvent[] = [];

  recordEvent(input: CreateTokenUsageEventInput): Promise<AiTokenUsageEvent> {
    const event = createTokenUsageEvent({
      ...input,
      id: `usage-${this.records.length + 1}`,
    });
    this.records.unshift(event);
    return Promise.resolve(event);
  }

  findForOwner(ownerUserId: string): Promise<AiTokenUsageEvent[]> {
    return Promise.resolve(this.records.filter((record) => record.ownerUserId === ownerUserId));
  }

  findCacheRecords(ownerUserId: string, limit: number): Promise<AiTokenUsageEvent[]> {
    return Promise.resolve(
      this.records
        .filter((record) => record.ownerUserId === ownerUserId && record.cacheHitTokens !== null)
        .slice(0, limit),
    );
  }
}

class FakeUserAccountRepository implements UserAccountRepository {
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

  findByOAuthOpenId(_provider: OAuthProvider): Promise<User | null> {
    return Promise.resolve(null);
  }

  createLocalUser(_input: CreateLocalUserInput): User {
    throw new Error('Not used by TokenUsageService');
  }

  createOAuthUser(_input: CreateOAuthUserInput): User {
    throw new Error('Not used by TokenUsageService');
  }

  save(user: User): Promise<User> {
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }

  update(id: string, patch: UserAccountUpdate): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      Object.assign(user, patch);
    }
    return Promise.resolve();
  }

  remove(user: User): Promise<void> {
    this.users.delete(user.id);
    return Promise.resolve();
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
    tokensUsed: '12',
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
  const tokenUsage = new FakeTokenUsageRepository();
  const users = new FakeUserAccountRepository();
  const service = new TokenUsageService(tokenUsage, users);
  return { service, tokenUsage, users };
}

describe('TokenUsageService repository boundary', () => {
  it('skips zero-token usage without touching persistence', async () => {
    const { service, tokenUsage, users } = createService();
    users.users.set('user-1', createUser());

    await service.recordTokenUsage(
      'user-1',
      'gpt-test',
      { inputTokens: 0, outputTokens: -4 },
      'editor',
      'openai',
    );

    expect(tokenUsage.records).toHaveLength(0);
    expect(users.users.get('user-1')).toMatchObject({
      tokensUsed: '12',
      tokensBalance: 88,
    });
  });

  it('records sanitized token usage and updates the user quota', async () => {
    const { service, tokenUsage, users } = createService();
    users.users.set('user-1', createUser());

    await service.recordTokenUsage(
      'user-1',
      'gpt-test',
      {
        inputTokens: 10.8,
        outputTokens: 5,
        cacheHitTokens: -1,
        cacheMissTokens: 4.9,
      },
      'editor',
      'openai',
    );

    expect(tokenUsage.records).toHaveLength(1);
    expect(tokenUsage.records[0]).toMatchObject({
      ownerUserId: 'user-1',
      endpoint: 'editor',
      provider: 'openai',
      model: 'gpt-test',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cacheHitTokens: null,
      cacheMissTokens: 4,
    });
    expect(users.users.get('user-1')).toMatchObject({
      tokensUsed: '27',
      tokensBalance: 73,
    });
  });

  it('summarizes cache stats through the token usage repository port', async () => {
    const { service, tokenUsage } = createService();
    tokenUsage.records.push(
      createTokenUsageEvent({
        id: 'usage-3',
        endpoint: 'editor',
        cacheHitTokens: 8,
        cacheMissTokens: 2,
        createdAt: new Date('2026-05-29T03:00:00.000Z'),
      }),
      createTokenUsageEvent({
        id: 'usage-2',
        endpoint: 'stream',
        cacheHitTokens: 2,
        cacheMissTokens: 8,
        createdAt: new Date('2026-05-29T02:00:00.000Z'),
      }),
      createTokenUsageEvent({
        id: 'usage-1',
        endpoint: 'editor',
        cacheHitTokens: 0,
        cacheMissTokens: 5,
        createdAt: new Date('2026-05-29T01:00:00.000Z'),
      }),
      createTokenUsageEvent({
        id: 'usage-other',
        ownerUserId: 'other',
        endpoint: 'editor',
        cacheHitTokens: 100,
        cacheMissTokens: 0,
      }),
    );

    await expect(service.getCacheStats('user-1')).resolves.toMatchObject({
      totalRequests: 3,
      totalCacheHitTokens: 10,
      totalCacheMissTokens: 15,
      overallCacheHitRate: '40.0%',
      byEndpoint: [
        {
          endpoint: 'editor',
          count: 2,
          cacheHitTokens: 8,
          cacheMissTokens: 7,
          hitRate: '53.3%',
        },
        {
          endpoint: 'stream',
          count: 1,
          cacheHitTokens: 2,
          cacheMissTokens: 8,
          hitRate: '20.0%',
        },
      ],
      recentRequests: [
        {
          timestamp: '2026-05-29T03:00:00.000Z',
          endpoint: 'editor',
          hitRate: '80.0%',
        },
        {
          timestamp: '2026-05-29T02:00:00.000Z',
          endpoint: 'stream',
          hitRate: '20.0%',
        },
        {
          timestamp: '2026-05-29T01:00:00.000Z',
          endpoint: 'editor',
          hitRate: '0.0%',
        },
      ],
    });
  });
});
