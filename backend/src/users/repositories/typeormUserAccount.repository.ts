import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type FindOptionsWhere, Repository } from 'typeorm';

import { User } from '../entities/user.entity';
import { NEW_USER_TOKEN_GIFT } from '../newUserTokenGift';
import type {
  CreateLocalUserInput,
  CreateOAuthUserInput,
  FindRegistrationIdentityInput,
  OAuthProvider,
  UserAccountRepository,
  UserAccountUpdate,
} from './userAccount.repository';

@Injectable()
export class TypeOrmUserAccountRepository implements UserAccountRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByLoginIdentifier(identifier: string): Promise<User | null> {
    return this.repo.findOne({
      where: [{ username: identifier }, { email: identifier }, { phone: identifier }],
    });
  }

  findByRegistrationIdentity(input: FindRegistrationIdentityInput): Promise<User | null> {
    const where: FindOptionsWhere<User>[] = [{ username: input.username }];
    if (input.email) {
      where.push({ email: input.email });
    }
    if (input.phone) {
      where.push({ phone: input.phone });
    }
    return this.repo.findOne({ where });
  }

  findByOAuthOpenId(provider: OAuthProvider, openId: string): Promise<User | null> {
    if (provider === 'wechat') {
      return this.repo.findOne({ where: { wechatOpenId: openId } });
    }
    return this.repo.findOne({ where: { qqOpenId: openId } });
  }

  createLocalUser(input: CreateLocalUserInput): User {
    return this.repo.create({
      username: input.username,
      email: input.email,
      phone: input.phone,
      passwordHash: input.passwordHash,
      passwordSeal: input.passwordSeal ?? null,
      linkedLogins: ['local'],
      userType: 'normal',
      freeChatUsedCount: 0,
      freeTemplateGenUsedCount: 0,
      tokensBalance: NEW_USER_TOKEN_GIFT,
      isAdmin: false,
    });
  }

  createOAuthUser(input: CreateOAuthUserInput): User {
    if (input.provider === 'wechat') {
      return this.repo.create({
        username: input.username,
        email: null,
        phone: null,
        passwordHash: null,
        passwordSeal: null,
        wechatOpenId: input.openId,
        linkedLogins: [input.provider],
        userType: 'normal',
        freeChatUsedCount: 0,
        freeTemplateGenUsedCount: 0,
        tokensBalance: NEW_USER_TOKEN_GIFT,
        isAdmin: false,
      });
    }
    return this.repo.create({
      username: input.username,
      email: null,
      phone: null,
      passwordHash: null,
      passwordSeal: null,
      qqOpenId: input.openId,
      linkedLogins: [input.provider],
      userType: 'normal',
      freeChatUsedCount: 0,
      freeTemplateGenUsedCount: 0,
      tokensBalance: NEW_USER_TOKEN_GIFT,
      isAdmin: false,
    });
  }

  save(user: User): Promise<User> {
    return this.repo.save(user);
  }

  async update(id: string, patch: UserAccountUpdate): Promise<void> {
    await this.repo.update(id, patch);
  }

  async remove(user: User): Promise<void> {
    await this.repo.remove(user);
  }

  async consumeFreeChatQuota(userId: string, limit: number): Promise<boolean> {
    return this.consumeFreeQuotaColumn(userId, 'freeChatUsedCount', limit);
  }

  async consumeFreeTemplateGenQuota(userId: string, limit: number): Promise<boolean> {
    return this.consumeFreeQuotaColumn(userId, 'freeTemplateGenUsedCount', limit);
  }

  releaseFreeChatQuota(userId: string): Promise<void> {
    return this.releaseFreeQuotaColumn(userId, 'freeChatUsedCount');
  }

  releaseFreeTemplateGenQuota(userId: string): Promise<void> {
    return this.releaseFreeQuotaColumn(userId, 'freeTemplateGenUsedCount');
  }

  async debitTokens(userId: string, totalTokens: number): Promise<number> {
    const amount = Math.max(0, Math.floor(totalTokens));
    if (amount > 0) {
      const floor = this.scalarFloorFunction();
      await this.repo
        .createQueryBuilder()
        .update(User)
        .set({
          tokensUsed: () => `"tokensUsed" + ${amount}`,
          tokensBalance: () => `${floor}(0, "tokensBalance" - ${amount})`,
        })
        .where('id = :userId', { userId })
        .execute();
    }
    const user = await this.repo.findOne({
      where: { id: userId },
      select: { id: true, tokensBalance: true },
    });
    return user?.tokensBalance ?? 0;
  }

  async listIds(): Promise<string[]> {
    const rows = await this.repo.find({ select: { id: true } });
    return rows.map((row) => row.id);
  }

  private async consumeFreeQuotaColumn(
    userId: string,
    column: 'freeChatUsedCount' | 'freeTemplateGenUsedCount',
    limit: number,
  ): Promise<boolean> {
    const result = await this.repo
      .createQueryBuilder()
      .update(User)
      .set({ [column]: () => `"${column}" + 1` })
      .where('id = :userId', { userId })
      .andWhere(`"userType" = :normalType`, { normalType: 'normal' })
      .andWhere(`"${column}" < :limit`, { limit })
      .execute();
    return (result.affected ?? 0) > 0;
  }

  private async releaseFreeQuotaColumn(
    userId: string,
    column: 'freeChatUsedCount' | 'freeTemplateGenUsedCount',
  ): Promise<void> {
    const floor = this.scalarFloorFunction();
    await this.repo
      .createQueryBuilder()
      .update(User)
      .set({ [column]: () => `${floor}(0, "${column}" - 1)` })
      .where('id = :userId', { userId })
      .andWhere('"userType" = :normalType', { normalType: 'normal' })
      .andWhere(`"${column}" > 0`)
      .execute();
  }

  /** SQLite MAX is scalar; PostgreSQL needs GREATEST. */
  private scalarFloorFunction(): 'MAX' | 'GREATEST' {
    return this.repo.manager.connection.options.type === 'postgres' ? 'GREATEST' : 'MAX';
  }
}
