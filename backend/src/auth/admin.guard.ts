import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '../config/config.service';
import { USER_ACCOUNT_REPOSITORY, type UserAccountRepository } from '../users/repositories';
import type { AuthenticatedRequest } from './authenticatedRequest.interface';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly users: UserAccountRepository,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = req.user.sub;
    if (!userId) {
      throw new UnauthorizedException('Missing token');
    }
    const user = await this.users.findById(userId);
    if (!user?.isActive) {
      throw new ForbiddenException('账号已停用');
    }
    const configuredAdmin = this.config.adminUsernames.includes(user.username);
    if (!user.isAdmin && !configuredAdmin) {
      throw new ForbiddenException('需要管理员权限');
    }
    return true;
  }
}
