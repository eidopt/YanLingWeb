import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';

import {
  TOKEN_USAGE_REPOSITORY,
  type TokenUsageRepository,
} from '../ai/repositories/tokenUsage.repository';
import { PublishedSite } from '../sites/entities/publishedSite.entity';
import { UpdateUserDto } from './dto/updateUser.dto';
import { User, type UserType } from './entities/user.entity';
import { USER_ACCOUNT_REPOSITORY, type UserAccountRepository } from './repositories';

// Local type aliases matching shared/types/user.types.ts (avoids cross-project rootDir expansion)
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
interface UserTokenUsageEventDto {
  id: string;
  endpoint: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHitTokens: number | null;
  cacheMissTokens: number | null;
  createdAt: string;
}
interface UserTokenUsageSummaryDto {
  ownerUserId: string;
  tokensUsed: number;
  tokensBalance: number;
  balanceCents: number;
  inputTokens: number;
  outputTokens: number;
  recordedTokens: number;
  requestCount: number;
  recent: UserTokenUsageEventDto[];
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly users: UserAccountRepository,
    @Inject(TOKEN_USAGE_REPOSITORY)
    private readonly tokenUsage: TokenUsageRepository,
    @Optional()
    @InjectRepository(PublishedSite)
    private readonly publishedSites?: Repository<PublishedSite>,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async findById(id: string): Promise<UserDto> {
    const user = await this.findEntityById(id);
    return this.toDto(user);
  }

  async getTokenUsageSummary(id: string): Promise<UserTokenUsageSummaryDto> {
    const user = await this.findEntityById(id);
    const events = await this.tokenUsage.findForOwner(id);

    const inputTokens = events.reduce((sum, event) => sum + event.inputTokens, 0);
    const outputTokens = events.reduce((sum, event) => sum + event.outputTokens, 0);
    const recordedTokens = events.reduce((sum, event) => sum + event.totalTokens, 0);

    return {
      ownerUserId: id,
      tokensUsed: Number(user.tokensUsed),
      tokensBalance: user.tokensBalance,
      balanceCents: user.balanceCents,
      inputTokens,
      outputTokens,
      recordedTokens,
      requestCount: events.length,
      recent: events.slice(0, 10).map((event) => ({
        id: event.id,
        endpoint: event.endpoint,
        provider: event.provider,
        model: event.model,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        totalTokens: event.totalTokens,
        cacheHitTokens: event.cacheHitTokens,
        cacheMissTokens: event.cacheMissTokens,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDto> {
    const user = await this.findEntityById(id);

    if (dto.password) {
      if (user.passwordHash) {
        if (!dto.currentPassword) {
          throw new BadRequestException('currentPassword is required to change password');
        }
        const isBcryptHash =
          user.passwordHash.startsWith('$2b$') || user.passwordHash.startsWith('$2a$');
        if (isBcryptHash) {
          const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
          if (!valid) {
            throw new UnauthorizedException('currentPassword is incorrect');
          }
        } else if (user.passwordHash !== dto.currentPassword) {
          throw new UnauthorizedException('currentPassword is incorrect');
        }
      }

      user.passwordHash = await bcrypt.hash(dto.password, 12);
      user.passwordSeal = null;
      user.tokenVersion += 1;
      if (!user.linkedLogins.includes('local')) {
        user.linkedLogins = [...user.linkedLogins, 'local'];
      }
    }

    if (dto.username !== undefined || dto.email !== undefined || dto.phone !== undefined) {
      const conflict = await this.users.findByRegistrationIdentity({
        username: dto.username ?? user.username,
        ...(dto.email !== undefined
          ? { email: dto.email }
          : user.email
            ? { email: user.email }
            : {}),
        ...(dto.phone !== undefined
          ? { phone: dto.phone }
          : user.phone
            ? { phone: user.phone }
            : {}),
      });
      if (conflict && conflict.id !== user.id) {
        throw new ConflictException('用户名、邮箱或手机号已被使用');
      }
    }

    if (dto.username !== undefined) {
      user.username = dto.username;
    }
    if (dto.email !== undefined) {
      user.email = dto.email;
    }
    if (dto.phone !== undefined) {
      user.phone = dto.phone;
    }

    const saved = await this.users.save(user);
    return this.toDto(saved);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findEntityById(id);
    user.tokenVersion += 1;
    await this.users.save(user);
    if (this.publishedSites) {
      await this.publishedSites.update({ ownerUserId: id }, { status: 'disabled' });
    }
    await this.users.remove(user);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async findEntityById(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
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
