import type { JwtService } from '@nestjs/jwt';

import type { ConfigService } from '../config/config.service';
import type { UserAccountRepository } from '../users/repositories';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import type { OAuthCallbackDto } from './dto/oauthCallback.dto';
import type { RegisterDto } from './dto/register.dto';

type AuthChallenge = ReturnType<AuthService['issueChallenge']>;
type AuthResponse = Awaited<ReturnType<AuthService['register']>>;
type OAuthQrCode = ReturnType<AuthService['getOAuthQrCodeUrl']>;

interface AuthHarness {
  controller: AuthController;
  service: MockAuthService;
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
};

const unusedJwt = {
  sign: () => {
    throw new Error('unused jwt');
  },
} as unknown as JwtService;

const unusedConfig = {
  oauth: {
    wechat: { appId: '', appSecret: '', redirectUri: '' },
    qq: { appId: '', appSecret: '', redirectUri: '' },
  },
} as unknown as ConfigService;

class MockAuthService extends AuthService {
  readonly issueChallengeMock = jest.fn<AuthChallenge, []>();
  readonly registerMock = jest.fn<Promise<AuthResponse>, [RegisterDto]>();
  readonly loginMock = jest.fn<Promise<AuthResponse>, [LoginDto]>();
  readonly getOAuthQrCodeUrlMock = jest.fn<OAuthQrCode, ['wechat' | 'qq']>();
  readonly oauthCallbackMock = jest.fn<Promise<AuthResponse>, [OAuthCallbackDto]>();

  constructor() {
    super(unusedUsers, unusedJwt, unusedConfig);
  }

  override issueChallenge(): AuthChallenge {
    return this.issueChallengeMock();
  }

  override register(dto: RegisterDto): Promise<AuthResponse> {
    return this.registerMock(dto);
  }

  override login(dto: LoginDto): Promise<AuthResponse> {
    return this.loginMock(dto);
  }

  override getOAuthQrCodeUrl(provider: 'wechat' | 'qq'): OAuthQrCode {
    return this.getOAuthQrCodeUrlMock(provider);
  }

  override oauthCallback(dto: OAuthCallbackDto): Promise<AuthResponse> {
    return this.oauthCallbackMock(dto);
  }
}

function createAuthResponse(overrides: Partial<AuthResponse> = {}): AuthResponse {
  return {
    accessToken: 'jwt-token',
    user: {
      id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      phone: null,
      linkedLogins: ['local'],
      tokensUsed: 0,
      tokensBalance: 100,
      balanceCents: 0,
      isActive: true,
      createdAt: '2026-05-29T00:00:00.000Z',
      lastLoginAt: null,
    },
    ...overrides,
  };
}

function createHarness(): AuthHarness {
  const service = new MockAuthService();
  return { controller: new AuthController(service), service };
}

describe('AuthController', () => {
  it('issues a login challenge', () => {
    const { controller, service } = createHarness();
    const challenge: AuthChallenge = {
      nonce: 'a'.repeat(64),
      expiresAt: '2026-05-29T00:05:00.000Z',
    };
    service.issueChallengeMock.mockReturnValue(challenge);

    expect(controller.getChallenge()).toBe(challenge);
    expect(service.issueChallengeMock).toHaveBeenCalledWith();
  });

  it('registers a new user and forwards the dto', async () => {
    const { controller, service } = createHarness();
    const dto: RegisterDto = {
      username: 'alice',
      password: 'a'.repeat(64),
      email: 'alice@example.com',
    };
    const response = createAuthResponse();
    service.registerMock.mockResolvedValue(response);

    await expect(controller.register(dto)).resolves.toBe(response);
    expect(service.registerMock).toHaveBeenCalledWith(dto);
  });

  it('logs in and forwards the dto', async () => {
    const { controller, service } = createHarness();
    const dto: LoginDto = {
      identifier: 'alice',
      password: 'a'.repeat(64),
      nonce: 'b'.repeat(64),
    };
    const response = createAuthResponse();
    service.loginMock.mockResolvedValue(response);

    await expect(controller.login(dto)).resolves.toBe(response);
    expect(service.loginMock).toHaveBeenCalledWith(dto);
  });

  it('returns a WeChat OAuth QR code for the requested provider', () => {
    const { controller, service } = createHarness();
    const qr: OAuthQrCode = { qrUrl: 'https://open.weixin.qq.com/...', state: 'state-1' };
    service.getOAuthQrCodeUrlMock.mockReturnValue(qr);

    expect(controller.getQrCode('wechat')).toBe(qr);
    expect(service.getOAuthQrCodeUrlMock).toHaveBeenCalledWith('wechat');
  });

  it('returns a QQ OAuth QR code for the requested provider', () => {
    const { controller, service } = createHarness();
    const qr: OAuthQrCode = { qrUrl: 'https://graph.qq.com/...', state: 'state-2' };
    service.getOAuthQrCodeUrlMock.mockReturnValue(qr);

    expect(controller.getQrCode('qq')).toBe(qr);
    expect(service.getOAuthQrCodeUrlMock).toHaveBeenCalledWith('qq');
  });

  it('handles an OAuth callback and forwards the dto', async () => {
    const { controller, service } = createHarness();
    const dto: OAuthCallbackDto = {
      provider: 'wechat',
      code: 'auth-code',
      state: 'state-1',
    };
    const response = createAuthResponse({ user: createAuthResponse().user });
    service.oauthCallbackMock.mockResolvedValue(response);

    await expect(controller.oauthCallback(dto)).resolves.toBe(response);
    expect(service.oauthCallbackMock).toHaveBeenCalledWith(dto);
  });

  it('propagates errors thrown by the auth service on login', async () => {
    const { controller, service } = createHarness();
    const dto: LoginDto = {
      identifier: 'alice',
      password: 'a'.repeat(64),
      nonce: 'b'.repeat(64),
    };
    const error = new Error('Invalid credentials');
    service.loginMock.mockRejectedValue(error);

    await expect(controller.login(dto)).rejects.toBe(error);
    expect(service.loginMock).toHaveBeenCalledWith(dto);
  });
});
