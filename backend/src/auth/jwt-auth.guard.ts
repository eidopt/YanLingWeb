import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { ConfigFactory } from '../config/config.factory';

interface AuthenticatedRequest extends Request {
  user: { sub: string; username: string; };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(req);
    if (!token) {throw new UnauthorizedException('Missing token');}

    try {
      const payload = this.jwtService.verify<{ sub: string; username: string; }>(token, {
        secret: ConfigFactory.build().jwt.secret,
      });
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(req: Request): string | null {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {return auth.slice(7);}
    return null;
  }
}
