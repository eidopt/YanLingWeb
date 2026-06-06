import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type FindOptionsWhere, Repository } from 'typeorm';

import { User } from '../entities/user.entity';
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
      linkedLogins: ['local'],
    });
  }

  createOAuthUser(input: CreateOAuthUserInput): User {
    if (input.provider === 'wechat') {
      return this.repo.create({
        username: input.username,
        email: null,
        phone: null,
        passwordHash: null,
        wechatOpenId: input.openId,
        linkedLogins: [input.provider],
      });
    }
    return this.repo.create({
      username: input.username,
      email: null,
      phone: null,
      passwordHash: null,
      qqOpenId: input.openId,
      linkedLogins: [input.provider],
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
}
