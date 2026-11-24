import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { ConfigService } from '../config/config.service';
import { USER_ACCOUNT_REPOSITORY, type UserAccountRepository } from '../users/repositories';

interface AuthenticatedRequest extends Request {
  user: { sub: string; username: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly users: UserAccountRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(req);
    if (!token) {
      throw new UnauthorizedException('Missing token');
    }

    try {
      const payload = this.jwtService.verify<{ sub: string; username: string; ver?: number }>(
        token,
        {
          secret: this.config.jwt.secret,
        },
      );
      const user = await this.users.findById(payload.sub);
      if (!user?.isActive || (payload.ver ?? 0) !== user.tokenVersion) {
        throw new UnauthorizedException('账号已停用或不存在');
      }
      req.user = { sub: user.id, username: user.username };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(req: Request): string | null {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      return auth.slice(7);
    }
    return null;
  }
}
