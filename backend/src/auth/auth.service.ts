import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';

import { ConfigService } from '../config/config.service';
import { User } from '../users/entities/user.entity';

// Type aliases matching shared/types/user.types.ts
interface UserDto {
  id: string; username: string; email: string | null; phone: string | null;
  linkedLogins: string[]; tokensUsed: number; tokensBalance: number;
  balanceCents: number; isActive: boolean; createdAt: string; lastLoginAt: string | null;
}
interface AuthResponseDto { accessToken: string; user: UserDto; }

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
}

interface OAuthCallbackDto {
  provider: 'wechat' | 'qq';
  code: string;
  state: string;
}

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Challenge-response
  // ---------------------------------------------------------------------------

  issueChallenge(): { nonce: string; expiresAt: string } {
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
  }

  // ---------------------------------------------------------------------------
  // Registration & local login
  // ---------------------------------------------------------------------------

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const exists = await this.repo.findOne({
      where: [
        { username: dto.username },
        ...(dto.email ? [{ email: dto.email }] : []),
        ...(dto.phone ? [{ phone: dto.phone }] : []),
      ],
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
    const user = this.repo.create({
      username: dto.username,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      passwordHash: hashedPassword,
      linkedLogins: ['local'],
    });
    const saved = await this.repo.save(user);
    return this.buildAuthResponse(saved);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    // Consume nonce first — even on auth failure, the nonce must not be reusable
    this.consumeNonce(dto.nonce);

    const user = await this.repo.findOne({
      where: [
        { username: dto.identifier },
        { email: dto.identifier },
        { phone: dto.identifier },
      ],
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException({
        errorCode: 'INVALID_CREDENTIALS',
        message: '账号或密码错误',
      });
    }

    // Verify password with dual-track support:
    // - New bcrypt format: stored hash starts with "$2b$" or "$2a$"
    // - Legacy SHA-256 format: stored hash is a hex string
    //
    // Protocol (both tracks):
    //   Frontend sends: dto.password = SHA-256(rawPassword)
    //   Nonce (dto.nonce) is consumed above for anti-replay only — it does NOT
    //   participate in password hashing.
    const isBcryptHash = user.passwordHash.startsWith('$2b$') || user.passwordHash.startsWith('$2a$');

    if (isBcryptHash) {
      // New format: bcrypt.compare(plaintext_candidate, bcrypt_hash)
      // dto.password = SHA-256(rawPassword) — this is the "plaintext" we stored at registration
      const valid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!valid) {
        throw new UnauthorizedException({
          errorCode: 'INVALID_CREDENTIALS',
          message: '账号或密码错误',
        });
      }
    } else {
      // Legacy format: stored hash is SHA-256(rawPassword)
      // Direct comparison — dto.password IS SHA-256(rawPassword)
      if (dto.password !== user.passwordHash) {
        throw new UnauthorizedException({
          errorCode: 'INVALID_CREDENTIALS',
          message: '账号或密码错误',
        });
      }

      // Silent upgrade: hash the old SHA-256 value with bcrypt for future logins
      try {
        const upgraded = await bcrypt.hash(user.passwordHash, 12);
        await this.repo.update(user.id, { passwordHash: upgraded });
        this.logger.log(`Silently upgraded password hash to bcrypt for user ${user.id}`);
      } catch (err) {
        // Non-critical: log but don't fail the login
        this.logger.warn(
          `Failed to upgrade password hash for user ${user.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    await this.repo.update(user.id, { lastLoginAt: new Date() });
    return this.buildAuthResponse(user);
  }

  // ---------------------------------------------------------------------------
  // OAuth (WeChat / QQ)
  // ---------------------------------------------------------------------------

  getOAuthQrCodeUrl(provider: 'wechat' | 'qq'): { qrUrl: string; state: string } {
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
    const openIdField = dto.provider === 'wechat' ? 'wechatOpenId' : 'qqOpenId';

    let user = await this.repo.findOne({ where: { [openIdField]: openId } });

    if (!user) {
      const username = `${dto.provider}_${openId.slice(0, 8)}`;
      user = this.repo.create({
        username,
        email: null,
        phone: null,
        passwordHash: null,
        [openIdField]: openId,
        linkedLogins: [dto.provider],
      });
      user = await this.repo.save(user);
    } else if (!user.linkedLogins.includes(dto.provider)) {
      user.linkedLogins = [...user.linkedLogins, dto.provider];
      await this.repo.update(user.id, { linkedLogins: user.linkedLogins });
    }

    await this.repo.update(user.id, { lastLoginAt: new Date() });
    return this.buildAuthResponse(user);
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
  }

  /**
   * Exchange authorization code for OpenID.
   */
  private async fetchOAuthOpenId(
    provider: 'wechat' | 'qq',
    code: string,
  ): Promise<string> {
    const oauthConfig = this.getOAuthProviderEnv(provider);

    if (provider === 'wechat') {
      const url =
        `https://api.weixin.qq.com/sns/oauth2/access_token` +
        `?appid=${oauthConfig.appId}&secret=${oauthConfig.appSecret}` +
        `&code=${code}&grant_type=authorization_code`;
      const res = await fetch(url);
      const data = await res.json() as { openid?: string; errmsg?: string };
      if (!data.openid) {
        throw new UnauthorizedException(`WeChat OAuth failed: ${data.errmsg ?? 'unknown'}`);
      }
      return data.openid;
    }

    const tokenUrl =
      `https://graph.qq.com/oauth2.0/token` +
      `?grant_type=authorization_code&client_id=${oauthConfig.appId}` +
      `&client_secret=${oauthConfig.appSecret}&code=${code}` +
      `&redirect_uri=${oauthConfig.redirectUri}&fmt=json`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      throw new UnauthorizedException(
        `QQ token exchange failed: ${tokenData.error ?? 'unknown'}`,
      );
    }
    const meRes = await fetch(
      `https://graph.qq.com/oauth2.0/me?access_token=${tokenData.access_token}&fmt=json`,
    );
    const meData = await meRes.json() as { openid?: string; error?: string };
    if (!meData.openid) {
      throw new UnauthorizedException(
        `QQ OpenID fetch failed: ${meData.error ?? 'unknown'}`,
      );
    }
    return meData.openid;
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
    const payload = { sub: user.id, username: user.username };
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
      tokensUsed: Number(user.tokensUsed),
      tokensBalance: user.tokensBalance,
      balanceCents: user.balanceCents,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }
}
