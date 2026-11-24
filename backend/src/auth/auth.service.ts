import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

import { ConfigService } from '../config/config.service';
import { User, type UserType } from '../users/entities/user.entity';
import {
  USER_ACCOUNT_REPOSITORY,
  type UserAccountRepository,
  type UserAccountUpdate,
} from '../users/repositories';
import { loginProof, openPasswordSeal, safeEqualHex, sealPassword } from './passwordSeal';

// Type aliases matching shared/types/user.types.ts
interface UserDto {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  linkedLogins: string[];
  userType: UserType;
  freeChatUsedCount: number;
  freeTemplateGenUsedCount: number;
  tokensUsed: number;
  tokensBalance: number;
  balanceCents: number;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}
interface AuthResponseDto {
  accessToken: string;
  user: UserDto;
}

interface AuthChallengeDto {
  nonce: string;
  expiresAt: string;
}

interface OAuthQrCodeDto {
  qrUrl: string;
  state: string;
}

interface RegisterDto {
  username: string;
  password: string;
  email?: string;
  phone?: string;
}

interface LoginDto {
  identifier: string;
  password: string;
  nonce: string;
  legacyUpgrade?: boolean;
}

interface OAuthCallbackDto {
  provider: 'wechat' | 'qq';
  code: string;
  state: string;
}

interface WeChatOpenIdResponse {
  openid?: string;
  errmsg?: string;
}

interface QqTokenResponse {
  access_token?: string;
  error?: string;
}

interface QqOpenIdResponse {
  openid?: string;
  error?: string;
}

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CHALLENGE_ENTRIES = 5_000;

interface NonceEntry {
  expiresAt: number;
}

interface OAuthStateEntry {
  expiresAt: number;
  provider: 'wechat' | 'qq';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * In-memory nonce store. Nonces are short-lived (5 min) and single-use,
   * so in-memory is appropriate — no persistence needed.
   */
  private readonly nonces = new Map<string, NonceEntry>();
  private readonly oauthStates = new Map<string, OAuthStateEntry>();

  constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly users: UserAccountRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Challenge-response
  // ---------------------------------------------------------------------------

  issueChallenge(): AuthChallengeDto {
    this.pruneExpiredNonces();
    const nonce = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + NONCE_TTL_MS;
    this.nonces.set(nonce, { expiresAt });
    return { nonce, expiresAt: new Date(expiresAt).toISOString() };
  }

  private consumeNonce(nonce: string): void {
    const entry = this.nonces.get(nonce);
    if (!entry) {
      throw new UnauthorizedException({
        errorCode: 'INVALID_NONCE',
        message: '登录会话已过期，请重新登录',
      });
    }
    this.nonces.delete(nonce); // single-use: remove immediately
    if (Date.now() > entry.expiresAt) {
      throw new UnauthorizedException({
        errorCode: 'INVALID_NONCE',
        message: '登录会话已过期，请重新登录',
      });
    }
  }

  private pruneExpiredNonces(): void {
    const now = Date.now();
    for (const [nonce, entry] of this.nonces) {
      if (now > entry.expiresAt) {
        this.nonces.delete(nonce);
      }
    }
    this.capMap(this.nonces);
  }

  // ---------------------------------------------------------------------------
  // Registration & local login
  // ---------------------------------------------------------------------------

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const exists = await this.users.findByRegistrationIdentity({
      username: dto.username,
      email: dto.email,
      phone: dto.phone,
    });
    if (exists) {
      throw new ConflictException({
        errorCode: 'ALREADY_EXISTS',
        message: '用户名、邮箱或手机号已被使用',
      });
    }

    // dto.password is SHA-256(rawPassword) produced by the frontend.
    // Store with bcrypt for security (frontend hash is too fast to resist brute-force).
    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const user = this.users.createLocalUser({
      username: dto.username,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      passwordHash: hashedPassword,
      passwordSeal: sealPassword(this.config.jwt.secret, dto.password),
    });
    const saved = await this.users.save(user);
    return this.buildAuthResponse(saved);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    // Consume nonce first — even on auth failure, the nonce must not be reusable
    this.consumeNonce(dto.nonce);

    const user = await this.users.findByLoginIdentifier(dto.identifier);

    if (!user?.passwordHash) {
      throw new UnauthorizedException({
        errorCode: 'INVALID_CREDENTIALS',
        message: '账号或密码错误',
      });
    }

    const sealPatch = await this.verifyPassword(user, dto);
    this.assertAccountActive(user);

    await this.users.update(user.id, { lastLoginAt: new Date(), ...sealPatch });
    if (this.isConfiguredAdmin(user.username) && !user.isAdmin) {
      await this.users.update(user.id, { isAdmin: true });
      user.isAdmin = true;
    }
    return this.buildAuthResponse({ ...user, lastLoginAt: new Date() });
  }

  // ---------------------------------------------------------------------------
  // OAuth (WeChat / QQ)
  // ---------------------------------------------------------------------------

  getOAuthQrCodeUrl(provider: 'wechat' | 'qq'): OAuthQrCodeDto {
    const oauthConfig = this.getOAuthProviderEnv(provider);
    const state = this.issueOAuthState(provider);

    if (provider === 'wechat') {
      const redirectUri = encodeURIComponent(oauthConfig.redirectUri);
      const qrUrl =
        `https://open.weixin.qq.com/connect/qrconnect` +
        `?appid=${oauthConfig.appId}&redirect_uri=${redirectUri}` +
        `&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`;
      return { qrUrl, state };
    }

    // QQ Connect OAuth 2.0
    const redirectUri = encodeURIComponent(oauthConfig.redirectUri);
    const qrUrl =
      `https://graph.qq.com/oauth2.0/authorize` +
      `?response_type=code&client_id=${oauthConfig.appId}` +
      `&redirect_uri=${redirectUri}&state=${state}&scope=get_user_info`;
    return { qrUrl, state };
  }

  async oauthCallback(dto: OAuthCallbackDto): Promise<AuthResponseDto> {
    this.consumeOAuthState(dto.provider, dto.state);

    const openId = await this.fetchOAuthOpenId(dto.provider, dto.code);

    let user = await this.users.findByOAuthOpenId(dto.provider, openId);

    if (!user) {
      user = await this.createUniqueOAuthUser(dto.provider, openId);
    } else if (!user.linkedLogins.includes(dto.provider)) {
      user.linkedLogins = [...user.linkedLogins, dto.provider];
      await this.users.update(user.id, { linkedLogins: user.linkedLogins });
    }

    this.assertAccountActive(user);
    const lastLoginAt = new Date();
    await this.users.update(user.id, { lastLoginAt });
    return this.buildAuthResponse({ ...user, lastLoginAt });
  }

  private async verifyPassword(user: User, dto: LoginDto): Promise<UserAccountUpdate> {
    if (user.passwordSeal) {
      const staticHash = openPasswordSeal(this.config.jwt.secret, user.passwordSeal);
      const expected = staticHash ? loginProof(dto.nonce, staticHash) : '';
      if (!staticHash || !safeEqualHex(expected, dto.password)) {
        throw new UnauthorizedException({
          errorCode: 'INVALID_CREDENTIALS',
          message: '账号或密码错误',
        });
      }
      return {};
    }

    const staticMatches = await this.staticPasswordMatches(user, dto.password);
    if (!staticMatches) {
      throw new UnauthorizedException({
        errorCode: dto.legacyUpgrade ? 'INVALID_CREDENTIALS' : 'LEGACY_PASSWORD_REQUIRED',
        message: dto.legacyUpgrade ? '账号或密码错误' : '登录凭证需要升级，请使用当前密码重试',
      });
    }

    try {
      const passwordHash =
        user.passwordHash?.startsWith('$2b$') || user.passwordHash?.startsWith('$2a$')
          ? user.passwordHash
          : await bcrypt.hash(dto.password, 12);
      return {
        passwordHash,
        passwordSeal: sealPassword(this.config.jwt.secret, dto.password),
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to upgrade password hash for user ${user.id}: ${reason}`);
      return {};
    }
  }

  private async staticPasswordMatches(user: User, passwordSha256: string): Promise<boolean> {
    if (!user.passwordHash) {
      return false;
    }
    if (user.passwordHash.startsWith('$2b$') || user.passwordHash.startsWith('$2a$')) {
      return bcrypt.compare(passwordSha256, user.passwordHash);
    }
    return user.passwordHash === passwordSha256;
  }

  private assertAccountActive(user: User): void {
    if (!user.isActive) {
      throw new ForbiddenException({
        errorCode: 'ACCOUNT_DISABLED',
        message: '账号已停用',
      });
    }
  }

  private isConfiguredAdmin(username: string): boolean {
    return this.config.adminUsernames.includes(username);
  }

  private async createUniqueOAuthUser(provider: 'wechat' | 'qq', openId: string): Promise<User> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const username = `${provider}_${openId.slice(0, 8)}_${randomBytes(3).toString('hex')}`;
      const created = this.users.createOAuthUser({ provider, openId, username });
      try {
        return await this.users.save(created);
      } catch (err) {
        lastError = err;
        if (!isUniqueViolation(err)) {
          throw err;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new ConflictException('无法创建 OAuth 账号');
  }

  private issueOAuthState(provider: 'wechat' | 'qq'): string {
    this.pruneExpiredOAuthStates();

    const state = randomBytes(24).toString('hex');
    this.oauthStates.set(state, {
      provider,
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    });
    return state;
  }

  private consumeOAuthState(provider: 'wechat' | 'qq', state: string): void {
    const entry = this.oauthStates.get(state);
    if (!entry) {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }

    this.oauthStates.delete(state);

    if (Date.now() > entry.expiresAt) {
      throw new UnauthorizedException('OAuth state has expired — request a new QR code');
    }

    if (entry.provider !== provider) {
      throw new UnauthorizedException('OAuth state provider mismatch');
    }
  }

  private pruneExpiredOAuthStates(): void {
    const now = Date.now();
    for (const [state, entry] of this.oauthStates) {
      if (now > entry.expiresAt) {
        this.oauthStates.delete(state);
      }
    }
    this.capMap(this.oauthStates);
  }

  private capMap(map: Map<string, { expiresAt: number }>): void {
    if (map.size <= MAX_CHALLENGE_ENTRIES) {
      return;
    }
    const oldest = [...map.entries()].sort((left, right) => left[1].expiresAt - right[1].expiresAt);
    for (const [key] of oldest.slice(0, map.size - MAX_CHALLENGE_ENTRIES)) {
      map.delete(key);
    }
  }

  /**
   * Exchange authorization code for OpenID.
   */
  private async fetchOAuthOpenId(provider: 'wechat' | 'qq', code: string): Promise<string> {
    const oauthConfig = this.getOAuthProviderEnv(provider);

    if (provider === 'wechat') {
      const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
      url.searchParams.set('appid', oauthConfig.appId);
      url.searchParams.set('secret', oauthConfig.appSecret);
      url.searchParams.set('code', code);
      url.searchParams.set('grant_type', 'authorization_code');
      const data = await this.fetchJson<WeChatOpenIdResponse>(url);
      if (!data.openid) {
        throw new UnauthorizedException(`WeChat OAuth failed: ${data.errmsg ?? 'unknown'}`);
      }
      return data.openid;
    }

    const tokenUrl = new URL('https://graph.qq.com/oauth2.0/token');
    tokenUrl.searchParams.set('grant_type', 'authorization_code');
    tokenUrl.searchParams.set('client_id', oauthConfig.appId);
    tokenUrl.searchParams.set('client_secret', oauthConfig.appSecret);
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('redirect_uri', oauthConfig.redirectUri);
    tokenUrl.searchParams.set('fmt', 'json');
    const tokenData = await this.fetchJson<QqTokenResponse>(tokenUrl);
    if (!tokenData.access_token) {
      throw new UnauthorizedException(`QQ token exchange failed: ${tokenData.error ?? 'unknown'}`);
    }
    const meUrl = new URL('https://graph.qq.com/oauth2.0/me');
    meUrl.searchParams.set('access_token', tokenData.access_token);
    meUrl.searchParams.set('fmt', 'json');
    const meData = await this.fetchJson<QqOpenIdResponse>(meUrl);
    if (!meData.openid) {
      throw new UnauthorizedException(`QQ OpenID fetch failed: ${meData.error ?? 'unknown'}`);
    }
    return meData.openid;
  }

  private async fetchJson<T>(url: URL): Promise<T> {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      throw new UnauthorizedException('OAuth provider request failed');
    }
    return (await res.json()) as T;
  }

  private getOAuthProviderEnv(provider: 'wechat' | 'qq'): {
    appId: string;
    appSecret: string;
    redirectUri: string;
  } {
    const oauthConfig = this.config.oauth[provider];
    if (!oauthConfig.appId || !oauthConfig.appSecret || !oauthConfig.redirectUri) {
      throw new BadRequestException(`${provider} OAuth is not configured`);
    }

    return {
      appId: oauthConfig.appId,
      appSecret: oauthConfig.appSecret,
      redirectUri: oauthConfig.redirectUri,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildAuthResponse(user: User): AuthResponseDto {
    const payload = { sub: user.id, username: user.username, ver: user.tokenVersion };
    return {
      accessToken: this.jwtService.sign(payload),
      user: this.toDto(user),
    };
  }

  private toDto(user: User): UserDto {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      linkedLogins: user.linkedLogins,
      userType: user.userType,
      freeChatUsedCount: user.freeChatUsedCount,
      freeTemplateGenUsedCount: user.freeTemplateGenUsedCount,
      tokensUsed: Number(user.tokensUsed),
      tokensBalance: user.tokensBalance,
      balanceCents: user.balanceCents,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }
}

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /unique|constraint|already exists/i.test(message);
}
