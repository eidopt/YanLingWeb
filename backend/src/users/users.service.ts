import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, Repository } from 'typeorm';

import { ConfigFactory } from '../config/config.factory';
import { LoginDto } from './dto/login.dto';
import { OAuthCallbackDto } from './dto/oauth-callback.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

// Local type aliases matching shared/types/user.types.ts (avoids cross-project rootDir expansion)
interface UserDto {
  id: string; username: string; email: string | null; phone: string | null;
  linkedLogins: string[]; tokensUsed: number; tokensBalance: number;
  balanceCents: number; isActive: boolean; createdAt: string; lastLoginAt: string | null;
}
interface AuthResponseDto { accessToken: string; user: UserDto; }

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
export class UsersService {
  /**
   * In-memory nonce store. Nonces are short-lived (5 min) and single-use,
   * so in-memory is appropriate — no persistence needed.
   */
  private readonly nonces = new Map<string, NonceEntry>();
  private readonly oauthStates = new Map<string, OAuthStateEntry>();

  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    private readonly jwtService: JwtService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Force the in-memory sql.js database to be written to the file on disk.
   * This ensures durability of user registration / login timestamp even if
   * the process crashes before the next auto-save interval.
   */
  private async forceSaveDatabase(): Promise<void> {
    try {
      const driver = this.dataSource.driver as unknown as {
        options: { location?: string };
        save(location?: string): Promise<void>;
      };

      await driver.save(driver.options.location);
      this.logger.debug(`Database saved to ${driver.options.location ?? 'default location'}`);
    } catch (err) {
      this.logger.error(
        'forceSaveDatabase failed',
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Challenge-response
  // ---------------------------------------------------------------------------

  issueChallenge(): { nonce: string; expiresAt: string; } {
    this.pruneExpiredNonces();
    const nonce = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + NONCE_TTL_MS;
    this.nonces.set(nonce, { expiresAt });
    return { nonce, expiresAt: new Date(expiresAt).toISOString() };
  }

  private consumeNonce(nonce: string): void {
    const entry = this.nonces.get(nonce);
    if (!entry) {
      throw new UnauthorizedException('Invalid or expired nonce — request a new challenge');
    }
    this.nonces.delete(nonce); // single-use: remove immediately
    if (Date.now() > entry.expiresAt) {
      throw new UnauthorizedException('Nonce has expired — request a new challenge');
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
      throw new ConflictException('Username, email, or phone already in use');
    }

    // dto.password is SHA-256(rawPassword) produced by the frontend
    const user = this.repo.create({
      username: dto.username,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      passwordHash: dto.password,
      linkedLogins: ['local'],
    });
    const saved = await this.repo.save(user);
    await this.forceSaveDatabase();
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
      throw new UnauthorizedException('Invalid credentials');
    }

    // Recompute expected value: SHA256(nonce + storedPasswordHash)
    const expected = createHash('sha256')
      .update(dto.nonce + user.passwordHash)
      .digest('hex');

    if (expected !== dto.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.repo.update(user.id, { lastLoginAt: new Date() });
    await this.forceSaveDatabase();
    return this.buildAuthResponse(user);
  }

  // ---------------------------------------------------------------------------
  // OAuth (WeChat / QQ)
  // ---------------------------------------------------------------------------

  getOAuthQrCodeUrl(provider: 'wechat' | 'qq'): { qrUrl: string; state: string; } {
    const oauthConfig = this.getOAuthProviderEnv(provider);
    const state = this.issueOAuthState(provider);

    if (provider === 'wechat') {
      // WeChat Open Platform OAuth 2.0
      // Docs: https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/
      const redirectUri = encodeURIComponent(oauthConfig.redirectUri);
      const qrUrl =
        `https://open.weixin.qq.com/connect/qrconnect` +
        `?appid=${oauthConfig.appId}&redirect_uri=${redirectUri}` +
        `&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`;
      return { qrUrl, state };
    }

    // QQ Connect OAuth 2.0
    // Docs: https://wiki.connect.qq.com/
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
      await this.forceSaveDatabase();
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
   * Requires provider app id, secret, and redirect URI in environment config.
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
      const data = await res.json() as { openid?: string; errmsg?: string; };
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
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string; };
    if (!tokenData.access_token) {
      throw new UnauthorizedException(
        `QQ token exchange failed: ${tokenData.error ?? 'unknown'}`,
      );
    }
    const meRes = await fetch(
      `https://graph.qq.com/oauth2.0/me?access_token=${tokenData.access_token}&fmt=json`,
    );
    const meData = await meRes.json() as { openid?: string; error?: string; };
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
    const oauthConfig = ConfigFactory.build().oauth[provider];
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
  // CRUD
  // ---------------------------------------------------------------------------

  async findById(id: string): Promise<UserDto> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return this.toDto(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDto> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    if (dto.password) {
      if (!dto.currentPassword) {
        throw new BadRequestException('currentPassword is required to change password');
      }
      if (!user.passwordHash) {
        throw new BadRequestException('Cannot set password: account has no existing password');
      }
      if (user.passwordHash !== dto.currentPassword) {
        throw new UnauthorizedException('currentPassword is incorrect');
      }
      user.passwordHash = dto.password;
      if (!user.linkedLogins.includes('local')) {
        user.linkedLogins = [...user.linkedLogins, 'local'];
      }
    }

    if (dto.username !== undefined) { user.username = dto.username; }
    if (dto.email !== undefined) { user.email = dto.email; }
    if (dto.phone !== undefined) { user.phone = dto.phone; }

    const saved = await this.repo.save(user);
    return this.toDto(saved);
  }

  async remove(id: string): Promise<void> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    await this.repo.remove(user);
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
