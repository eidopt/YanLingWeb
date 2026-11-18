import { ForbiddenException } from '@nestjs/common';

import type { TokenUsageRepository } from '../ai/repositories/tokenUsage.repository';
import type { AuthenticatedRequest } from '../auth/authenticatedRequest.interface';
import type { UpdateUserDto } from './dto/updateUser.dto';
import type { UserAccountRepository } from './repositories';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

type UserProfile = Awaited<ReturnType<UsersService['findById']>>;
type UserTokenUsageSummary = Awaited<ReturnType<UsersService['getTokenUsageSummary']>>;

interface UsersHarness {
  controller: UsersController;
  service: MockUsersService;
}

const unusedUsers: UserAccountRepository = {
  findById: () => Promise.reject(new Error('unused repository')),
  findByLoginIdentifier: () => Promise.reject(new Error('unused repository')),
  findByRegistrationIdentity: () => Promise.reject(new Error('unused repository')),
  findByOAuthOpenId: () => Promise.reject(new Error('unused repository')),
  createLocalUser: () => {
    throw new Error('unused repository');
  },
  createOAuthUser: () => {
    throw new Error('unused repository');
  },
  save: () => Promise.reject(new Error('unused repository')),
  update: () => Promise.reject(new Error('unused repository')),
  remove: () => Promise.reject(new Error('unused repository')),
  consumeFreeChatQuota: () => Promise.reject(new Error('unused repository')),
  consumeFreeTemplateGenQuota: () => Promise.reject(new Error('unused repository')),
};

const unusedTokenUsage: TokenUsageRepository = {
  recordEvent: () => Promise.reject(new Error('unused repository')),
  findForOwner: () => Promise.reject(new Error('unused repository')),
  findCacheRecords: () => Promise.reject(new Error('unused repository')),
};

class MockUsersService extends UsersService {
  readonly findByIdMock = jest.fn<Promise<UserProfile>, [string]>();
  readonly tokenUsageMock = jest.fn<Promise<UserTokenUsageSummary>, [string]>();
  readonly updateMock = jest.fn<Promise<UserProfile>, [string, UpdateUserDto]>();
  readonly removeMock = jest.fn<Promise<void>, [string]>();

  constructor() {
    super(unusedUsers, unusedTokenUsage);
  }

  override findById(id: string): Promise<UserProfile> {
    return this.findByIdMock(id);
  }

  override getTokenUsageSummary(id: string): Promise<UserTokenUsageSummary> {
    return this.tokenUsageMock(id);
  }

  override update(id: string, dto: UpdateUserDto): Promise<UserProfile> {
    return this.updateMock(id, dto);
  }

  override remove(id: string): Promise<void> {
    return this.removeMock(id);
  }
}

function createProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-1',
    username: 'alice',
    email: 'alice@example.com',
    phone: null,
    linkedLogins: ['local'],
    userType: 'normal',
    freeChatUsedCount: 0,
    freeTemplateGenUsedCount: 0,
    tokensUsed: 0,
    tokensBalance: 100,
    balanceCents: 0,
    isActive: true,
    createdAt: '2026-05-29T00:00:00.000Z',
    lastLoginAt: null,
    ...overrides,
  };
}

function createUsageSummary(overrides: Partial<UserTokenUsageSummary> = {}): UserTokenUsageSummary {
  return {
    ownerUserId: 'user-1',
    tokensUsed: 0,
    tokensBalance: 100,
    balanceCents: 0,
    inputTokens: 10,
    outputTokens: 5,
    recordedTokens: 15,
    requestCount: 1,
    recent: [],
    ...overrides,
  };
}

function createRequest(userId = 'user-1'): AuthenticatedRequest {
  return { user: { sub: userId, username: 'alice' } } as AuthenticatedRequest;
}

function createHarness(): UsersHarness {
  const service = new MockUsersService();
  return { controller: new UsersController(service), service };
}

describe('UsersController', () => {
  it('gets the authenticated user profile', async () => {
    const { controller, service } = createHarness();
    const profile = createProfile();
    service.findByIdMock.mockResolvedValue(profile);

    await expect(controller.getMe(createRequest())).resolves.toBe(profile);

    expect(service.findByIdMock).toHaveBeenCalledWith('user-1');
  });

  it('gets token usage only for the authenticated user', async () => {
    const { controller, service } = createHarness();
    const summary = createUsageSummary();
    service.tokenUsageMock.mockResolvedValue(summary);

    await expect(controller.getTokenUsage('user-1', createRequest())).resolves.toBe(summary);

    expect(service.tokenUsageMock).toHaveBeenCalledWith('user-1');
  });

  it('rejects token usage access for another user', () => {
    const { controller, service } = createHarness();

    expect(() => controller.getTokenUsage('user-2', createRequest())).toThrow(ForbiddenException);
    expect(service.tokenUsageMock).not.toHaveBeenCalled();
  });

  it('finds, updates, and removes only the authenticated user account', async () => {
    const { controller, service } = createHarness();
    const profile = createProfile();
    const dto: UpdateUserDto = { username: 'alice-updated' };
    service.findByIdMock.mockResolvedValue(profile);
    service.updateMock.mockResolvedValue(createProfile({ username: dto.username }));
    service.removeMock.mockResolvedValue(undefined);

    await expect(controller.findOne('user-1', createRequest())).resolves.toBe(profile);
    await expect(controller.update('user-1', dto, createRequest())).resolves.toMatchObject({
      username: 'alice-updated',
    });
    await expect(controller.remove('user-1', createRequest())).resolves.toBeUndefined();

    expect(service.findByIdMock).toHaveBeenCalledWith('user-1');
    expect(service.updateMock).toHaveBeenCalledWith('user-1', dto);
    expect(service.removeMock).toHaveBeenCalledWith('user-1');
  });

  it('rejects profile mutation for another user', () => {
    const { controller, service } = createHarness();

    expect(() => controller.findOne('user-2', createRequest())).toThrow(ForbiddenException);
    expect(() => controller.update('user-2', {}, createRequest())).toThrow(ForbiddenException);
    expect(() => controller.remove('user-2', createRequest())).toThrow(ForbiddenException);
    expect(service.findByIdMock).not.toHaveBeenCalled();
    expect(service.updateMock).not.toHaveBeenCalled();
    expect(service.removeMock).not.toHaveBeenCalled();
  });
});
