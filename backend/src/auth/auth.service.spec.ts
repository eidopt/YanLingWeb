import {
  BadRequestException,
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import type { ConfigService } from '../config/config.service';
import { User } from '../users/entities/user.entity';
import type {
  CreateLocalUserInput,
  CreateOAuthUserInput,
  FindRegistrationIdentityInput,
  UserAccountRepository,
  UserAccountUpdate,
} from '../users/repositories';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

class FakeUserAccountRepository implements UserAccountRepository {
  readonly users = new Map<string, User>();
  readonly updates: { id: string; patch: UserAccountUpdate }[] = [];
  registrationIdentity: User | null = null;
  loginUser: User | null = null;
  oauthUser: User | null = null;

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  findByLoginIdentifier(): Promise<User | null> {
    return Promise.resolve(this.loginUser);
  }

  findByRegistrationIdentity(_input: FindRegistrationIdentityInput): Promise<User | null> {
    return Promise.resolve(this.registrationIdentity);
  }

  findByOAuthOpenId(): Promise<User | null> {
    return Promise.resolve(this.oauthUser);
  }

  createLocalUser(input: CreateLocalUserInput): User {
    return createUser({
      id: 'created-local-user',
      username: input.username,
      email: input.email,
      phone: input.phone,
      passwordHash: input.passwordHash,
      linkedLogins: ['local'],
    });
  }

  createOAuthUser(input: CreateOAuthUserInput): User {
    return createUser({
      id: `created-${input.provider}-user`,
      username: input.username,
      passwordHash: null,
      wechatOpenId: input.provider === 'wechat' ? input.openId : null,
      qqOpenId: input.provider === 'qq' ? input.openId : null,
      linkedLogins: [input.provider],
    });
  }

  save(user: User): Promise<User> {
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }

  update(id: string, patch: UserAccountUpdate): Promise<void> {
    this.updates.push({ id, patch });
    const user = this.users.get(id) ?? this.loginUser ?? this.oauthUser;
    if (user?.id === id) {
      Object.assign(user, patch);
    }
    return Promise.resolve();
  }

  remove(user: User): Promise<void> {
    this.users.delete(user.id);
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
}

function createUser(overrides: Partial<User> = {}): User {
  const now = new Date('2026-05-29T00:00:00.000Z');
  return Object.assign(new User(), {
    id: 'user-1',
    username: 'alice',
    email: 'alice@example.com',
    phone: null,
    passwordHash: '$2b$stored',
    wechatOpenId: null,
    qqOpenId: null,
    linkedLogins: ['local'],
    userType: 'normal',
    freeChatUsedCount: 0,
    freeTemplateGenUsedCount: 0,
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

function createConfig(
  oauth: ConfigService['oauth'] = {
    qq: {
      appId: 'qq-app',
      appSecret: 'qq-secret',
      redirectUri: 'https://example.com/auth/callback/qq',
    },
    wechat: {
      appId: 'wechat-app',
      appSecret: 'wechat-secret',
      redirectUri: 'https://example.com/auth/callback/wechat',
    },
  },
): ConfigService {
  return {
    jwt: {
      secret: 'jwt-test-secret',
      expiresIn: '7d',
    },
    oauth,
  } as ConfigService;
}

function createService(config = createConfig()) {
  const users = new FakeUserAccountRepository();
  const jwtService = new JwtService({ secret: config.jwt.secret });
  const service = new AuthService(users, jwtService, config);
  return { service, users };
}

function successfulJsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}

describe('AuthService', () => {
  const bcryptHash = bcrypt.hash as jest.MockedFunction<
    (data: string, saltOrRounds: number) => Promise<string>
  >;
  const bcryptCompare = bcrypt.compare as jest.MockedFunction<
    (data: string, encrypted: string) => Promise<boolean>
  >;
  const anyString = expect.any(String) as string;
  const anyDate = expect.any(Date) as Date;

  beforeEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    bcryptHash.mockReset();
    bcryptCompare.mockReset();
    bcryptHash.mockResolvedValue('$2b$hashed-password');
    bcryptCompare.mockResolvedValue(true);
  });

  it('issues single-use login challenges and signs successful bcrypt logins', async () => {
    const { service, users } = createService();
    users.loginUser = createUser({ passwordHash: '$2b$stored-hash' });
    const challenge = service.issueChallenge();

    await expect(
      service.login({
        identifier: 'alice',
        password: 'sha256-password',
        nonce: challenge.nonce,
      }),
    ).resolves.toMatchObject({
      accessToken: anyString,
      user: {
        id: 'user-1',
        username: 'alice',
        tokensUsed: 12,
      },
    });

    expect(bcryptCompare.mock.calls).toEqual([['sha256-password', '$2b$stored-hash']]);
    expect(users.updates).toHaveLength(1);
    expect(users.updates[0]).toMatchObject({
      id: 'user-1',
      patch: { lastLoginAt: anyDate },
    });

    await expect(
      service.login({
        identifier: 'alice',
        password: 'sha256-password',
        nonce: challenge.nonce,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects invalid credentials after consuming the nonce', async () => {
    const { service, users } = createService();
    users.loginUser = createUser({ passwordHash: '$2b$stored-hash' });
    bcryptCompare.mockResolvedValue(false);
    const challenge = service.issueChallenge();

    await expect(
      service.login({
        identifier: 'alice',
        password: 'wrong-password',
        nonce: challenge.nonce,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      service.login({
        identifier: 'alice',
        password: 'sha256-password',
        nonce: challenge.nonce,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.updates).toEqual([]);
  });

  it('rejects expired login challenges before looking up the user', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-29T00:00:00.000Z'));
    const { service, users } = createService();
    const challenge = service.issueChallenge();
    jest.setSystemTime(new Date('2026-05-29T00:06:00.000Z'));

    await expect(
      service.login({
        identifier: 'alice',
        password: 'sha256-password',
        nonce: challenge.nonce,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.loginUser).toBeNull();
  });

  it('registers new local users with bcrypt-hashed frontend password hashes', async () => {
    const { service, users } = createService();

    await expect(
      service.register({
        username: 'alice',
        email: 'alice@example.com',
        phone: '18800000000',
        password: 'sha256-password',
      }),
    ).resolves.toMatchObject({
      accessToken: anyString,
      user: {
        id: 'created-local-user',
        email: 'alice@example.com',
        linkedLogins: ['local'],
      },
    });

    expect(bcryptHash.mock.calls).toEqual([['sha256-password', 12]]);
    expect(users.users.get('created-local-user')).toMatchObject({
      passwordHash: '$2b$hashed-password',
    });
  });

  it('rejects duplicate registration identities', async () => {
    const { service, users } = createService();
    users.registrationIdentity = createUser();

    await expect(
      service.register({
        username: 'alice',
        password: 'sha256-password',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(bcryptHash).not.toHaveBeenCalled();
  });

  it('supports legacy SHA-256 password hashes and upgrades them after login', async () => {
    const { service, users } = createService();
    users.loginUser = createUser({ passwordHash: 'legacy-sha256' });
    const challenge = service.issueChallenge();

    await service.login({
      identifier: 'alice',
      password: 'legacy-sha256',
      nonce: challenge.nonce,
    });

    expect(bcryptHash.mock.calls).toEqual([['legacy-sha256', 12]]);
    expect(users.updates).toEqual([
      { id: 'user-1', patch: { passwordHash: '$2b$hashed-password' } },
      { id: 'user-1', patch: { lastLoginAt: anyDate } },
    ]);
  });

  it('does not fail legacy login when the best-effort bcrypt upgrade fails', async () => {
    const { service, users } = createService();
    users.loginUser = createUser({ passwordHash: 'legacy-sha256' });
    bcryptHash.mockRejectedValue(new Error('hash unavailable'));
    const challenge = service.issueChallenge();

    await expect(
      service.login({
        identifier: 'alice',
        password: 'legacy-sha256',
        nonce: challenge.nonce,
      }),
    ).resolves.toMatchObject({
      user: { id: 'user-1' },
    });
    expect(users.updates).toEqual([{ id: 'user-1', patch: { lastLoginAt: anyDate } }]);
  });

  it('builds OAuth QR URLs and rejects missing provider configuration', () => {
    const { service } = createService();

    expect(service.getOAuthQrCodeUrl('wechat')).toMatchObject({
      qrUrl: expect.stringContaining('https://open.weixin.qq.com/connect/qrconnect') as string,
      state: anyString,
    });
    expect(service.getOAuthQrCodeUrl('qq')).toMatchObject({
      qrUrl: expect.stringContaining('https://graph.qq.com/oauth2.0/authorize') as string,
      state: anyString,
    });

    const missingConfigService = createService(
      createConfig({
        qq: {},
        wechat: {},
      }),
    ).service;
    expect(() => missingConfigService.getOAuthQrCodeUrl('wechat')).toThrow(BadRequestException);
  });

  it('creates a new WeChat OAuth user after validating state and OpenID response', async () => {
    const { service, users } = createService();
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(successfulJsonResponse({ openid: 'wx-openid' }));
    const { state } = service.getOAuthQrCodeUrl('wechat');

    await expect(
      service.oauthCallback({
        provider: 'wechat',
        code: 'wechat-code',
        state,
      }),
    ).resolves.toMatchObject({
      user: {
        id: 'created-wechat-user',
        username: 'wechat_wx-openi',
        linkedLogins: ['wechat'],
      },
    });

    expect(users.users.get('created-wechat-user')).toMatchObject({
      wechatOpenId: 'wx-openid',
    });
    expect(users.updates).toEqual([{ id: 'created-wechat-user', patch: { lastLoginAt: anyDate } }]);
  });

  it('links QQ OAuth login method for an existing user', async () => {
    const { service, users } = createService();
    users.oauthUser = createUser({ linkedLogins: ['local'] });
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(successfulJsonResponse({ access_token: 'qq-token' }))
      .mockResolvedValueOnce(successfulJsonResponse({ openid: 'qq-openid' }));
    const { state } = service.getOAuthQrCodeUrl('qq');

    await expect(
      service.oauthCallback({
        provider: 'qq',
        code: 'qq-code',
        state,
      }),
    ).resolves.toMatchObject({
      user: {
        id: 'user-1',
        linkedLogins: ['local', 'qq'],
      },
    });

    expect(users.updates).toEqual([
      { id: 'user-1', patch: { linkedLogins: ['local', 'qq'] } },
      { id: 'user-1', patch: { lastLoginAt: anyDate } },
    ]);
  });

  it('rejects reused, mismatched, expired, and failed OAuth callbacks', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-29T00:00:00.000Z'));
    const { service } = createService();
    const wechat = service.getOAuthQrCodeUrl('wechat');

    await expect(
      service.oauthCallback({ provider: 'qq', code: 'qq-code', state: wechat.state }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(
      service.oauthCallback({ provider: 'wechat', code: 'wechat-code', state: wechat.state }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const expired = service.getOAuthQrCodeUrl('wechat');
    jest.setSystemTime(new Date('2026-05-29T00:06:00.000Z'));
    await expect(
      service.oauthCallback({ provider: 'wechat', code: 'wechat-code', state: expired.state }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    jest.useRealTimers();
    const fresh = service.getOAuthQrCodeUrl('wechat');
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(successfulJsonResponse({ errmsg: 'bad code' }));
    await expect(
      service.oauthCallback({ provider: 'wechat', code: 'bad-code', state: fresh.state }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
