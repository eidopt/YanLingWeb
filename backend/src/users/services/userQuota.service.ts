import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { USER_ACCOUNT_REPOSITORY, type UserAccountRepository } from '../repositories';

export { NEW_USER_TOKEN_GIFT } from '../newUserTokenGift';

export const NORMAL_USER_FREE_CHAT_LIMIT = 3;
export const NORMAL_USER_FREE_TEMPLATE_GEN_LIMIT = 1;

export const FREE_CHAT_QUOTA_EXCEEDED_CODE = 'FREE_CHAT_QUOTA_EXCEEDED';
export const FREE_TEMPLATE_QUOTA_EXCEEDED_CODE = 'FREE_TEMPLATE_QUOTA_EXCEEDED';
export const TOKEN_BALANCE_EXHAUSTED_CODE = 'TOKEN_BALANCE_EXHAUSTED';

export const FREE_CHAT_QUOTA_EXCEEDED_MESSAGE =
  '免费对话次数已用完，无法继续生成。普通用户最多 3 次，需要充值后继续使用。';
export const FREE_TEMPLATE_QUOTA_EXCEEDED_MESSAGE =
  '免费生成次数已用完，无法继续生成。普通用户从零生成模板最多 1 次，需要充值后继续使用。';
export const TOKEN_BALANCE_EXHAUSTED_MESSAGE =
  'Token 已用完，无法继续生成。新注册账号赠送 100 万 token，用完后需要充值。';

interface ConsumeOptions {
  /** A server-verified clarification follow-up skips a second count charge. */
  countExempt?: boolean;
}

@Injectable()
export class UserQuotaService {
  constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly users: UserAccountRepository,
  ) {}

  async consumeFreeChatQuota(userId: string, options?: ConsumeOptions): Promise<void> {
    await this.assertTokenBalance(userId);
    if (options?.countExempt) {
      return;
    }
    const user = await this.requireUser(userId);
    if (user.userType !== 'normal') {
      return;
    }
    const reserved = await this.users.consumeFreeChatQuota(userId, NORMAL_USER_FREE_CHAT_LIMIT);
    if (!reserved) {
      throw new ForbiddenException({
        code: FREE_CHAT_QUOTA_EXCEEDED_CODE,
        message: FREE_CHAT_QUOTA_EXCEEDED_MESSAGE,
      });
    }
  }

  async consumeFreeTemplateGenQuota(userId: string): Promise<void> {
    await this.assertTokenBalance(userId);
    const user = await this.requireUser(userId);
    if (user.userType !== 'normal') {
      return;
    }
    const reserved = await this.users.consumeFreeTemplateGenQuota(
      userId,
      NORMAL_USER_FREE_TEMPLATE_GEN_LIMIT,
    );
    if (!reserved) {
      throw new ForbiddenException({
        code: FREE_TEMPLATE_QUOTA_EXCEEDED_CODE,
        message: FREE_TEMPLATE_QUOTA_EXCEEDED_MESSAGE,
      });
    }
  }

  async assertTokenBalance(userId: string): Promise<void> {
    const user = await this.requireUser(userId);
    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'ACCOUNT_DISABLED',
        message: '账号已停用，无法继续生成。',
      });
    }
    if (user.tokensBalance <= 0) {
      throw new ForbiddenException({
        code: TOKEN_BALANCE_EXHAUSTED_CODE,
        message: TOKEN_BALANCE_EXHAUSTED_MESSAGE,
      });
    }
  }

  releaseFreeChatQuota(userId: string): Promise<void> {
    return this.users.releaseFreeChatQuota(userId);
  }

  releaseFreeTemplateGenQuota(userId: string): Promise<void> {
    return this.users.releaseFreeTemplateGenQuota(userId);
  }

  private async requireUser(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    return user;
  }
}
