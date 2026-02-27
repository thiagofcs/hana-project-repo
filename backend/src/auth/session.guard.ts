import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Request } from 'express';
import * as hana from '@sap/hana-client';
import { AuthService } from './auth.service';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.headers['x-session-token'];

    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Missing x-session-token header');
    }

    const session = this.authService.getSession(token);
    if (!session) {
      throw new UnauthorizedException('Invalid or expired session token');
    }

    (req as Request & { session: typeof session }).session = session;
    return true;
  }
}

/**
 * Parameter decorator that extracts the HANA pool from the session.
 */
export const SessionPool = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): hana.ConnectionPool => {
    const req = ctx.switchToHttp().getRequest<Request & { session: { pool: hana.ConnectionPool } }>();
    return req.session.pool;
  },
);
