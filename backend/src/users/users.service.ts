import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import {
  TOKEN_USAGE_REPOSITORY,
  type TokenUsageRepository,
} from '../ai/repositories/token-usage.repository';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { USER_ACCOUNT_REPOSITORY, type UserAccountRepository } from './repositories';

// Local type aliases matching shared/types/user.types.ts (avoids cross-project rootDir expansion)
interface UserDto {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  linkedLogins: string[];
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
      if (!dto.currentPassword) {
        throw new BadRequestException('currentPassword is required to change password');
      }
      if (!user.passwordHash) {
        throw new BadRequestException('Cannot set password: account has no existing password');
      }

      // Verify current password (supports both bcrypt and legacy SHA-256 formats)
      // dto.currentPassword = SHA-256(rawPassword), same as login protocol
      const isBcryptHash =
        user.passwordHash.startsWith('$2b$') || user.passwordHash.startsWith('$2a$');
      if (isBcryptHash) {
        const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
        if (!valid) {
          throw new UnauthorizedException('currentPassword is incorrect');
        }
      } else {
        // Legacy: direct comparison with stored SHA-256
        if (user.passwordHash !== dto.currentPassword) {
          throw new UnauthorizedException('currentPassword is incorrect');
        }
      }

      // Store new password with bcrypt
      user.passwordHash = await bcrypt.hash(dto.password, 12);
      if (!user.linkedLogins.includes('local')) {
        user.linkedLogins = [...user.linkedLogins, 'local'];
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
      tokensUsed: Number(user.tokensUsed),
      tokensBalance: user.tokensBalance,
      balanceCents: user.balanceCents,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }
}
