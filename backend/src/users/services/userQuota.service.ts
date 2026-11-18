import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { USER_ACCOUNT_REPOSITORY, type UserAccountRepository } from '../repositories';

export const NORMAL_USER_FREE_CHAT_LIMIT = 3;
export const NORMAL_USER_FREE_TEMPLATE_GEN_LIMIT = 1;

export const FREE_CHAT_QUOTA_EXCEEDED_CODE = 'FREE_CHAT_QUOTA_EXCEEDED';
export const FREE_TEMPLATE_QUOTA_EXCEEDED_CODE = 'FREE_TEMPLATE_QUOTA_EXCEEDED';

@Injectable()
export class UserQuotaService {
  constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly users: UserAccountRepository,
  ) {}

  async consumeFreeChatQuota(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    if (user.userType !== 'normal') {
      return;
    }

    const reserved = await this.users.consumeFreeChatQuota(userId, NORMAL_USER_FREE_CHAT_LIMIT);
    if (!reserved) {
      throw new ForbiddenException({
        code: FREE_CHAT_QUOTA_EXCEEDED_CODE,
        message: '免费余额度已用完，普通用户总对话次数不能超过 3 次，需要充值后继续使用。',
      });
    }
  }

  async consumeFreeTemplateGenQuota(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
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
        message: '免费余额度已用完，普通用户从零开始生成模板仅限 1 次，需要充值后继续使用。',
      });
    }
  }
}
