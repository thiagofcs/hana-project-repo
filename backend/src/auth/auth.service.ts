import { Injectable, UnauthorizedException, BadRequestException, Logger, OnModuleDestroy } from '@nestjs/common';
import * as hana from '@sap/hana-client';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { withPoolConnection } from '../database/pool.utils';

const SESSION_TTL_MS              = 8 * 60 * 60 * 1000;  // 8 hours
const SESSION_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;       // every 15 minutes
const MAX_SESSIONS                = 100;

interface SessionEntry {
  user:      string;
  host:      string;
  port:      string;
  database?: string;
  pool:      hana.ConnectionPool;
  createdAt: Date;
}

export interface SessionInfo {
  user:      string;
  host:      string;
  port:      string;
  database?: string;
}

@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly logger   = new Logger(AuthService.name);
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(
      () => this.cleanupExpiredSessions(),
      SESSION_CLEANUP_INTERVAL_MS,
    );
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.cleanupTimer);
    const closeAll = Array.from(this.sessions.values()).map(s =>
      new Promise<void>((resolve) => {
        s.pool.clear((err) => {
          if (err) this.logger.warn('Error clearing pool on shutdown', err);
          resolve();
        });
      }),
    );
    await Promise.all(closeAll);
    this.sessions.clear();
    this.logger.log('All sessions closed on shutdown');
  }

  private async cleanupExpiredSessions(): Promise<void> {
    const now     = Date.now();
    const expired = [...this.sessions.entries()]
      .filter(([, s]) => now - s.createdAt.getTime() > SESSION_TTL_MS)
      .map(([token]) => token);
    for (const token of expired) {
      await this.logout(token);
    }
    if (expired.length > 0) {
      this.logger.log(`Cleaned up ${expired.length} expired session(s)`);
    }
  }

  async login(dto: LoginDto): Promise<{ token: string; user: string; host: string; port: string }> {
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new BadRequestException('Maximum concurrent session limit reached. Please try again later.');
    }

    const connParams: Record<string, unknown> = {
      serverNode:             `${dto.host}:${dto.port}`,
      uid:                    dto.user,
      pwd:                    dto.password,
      encrypt:                true,
      sslValidateCertificate: false,
      communicationTimeout:   0,
      connectTimeout:         30000,
      poolingCheck:           true,
    };

    if (dto.database) {
      connParams.databaseName = dto.database;
    }

    const pool = hana.createPool(connParams, {
      min:                 1,
      max:                 10,
      maxWaitingRequests:  50,
      requestTimeout:      30000,
      checkConnectTimeout: 10000,
    });

    // Ping to validate credentials
    try {
      await withPoolConnection(pool, (conn) =>
        new Promise<void>((resolve, reject) => {
          conn.exec("SELECT 'ping' FROM DUMMY", (err) => {
            if (err) reject(err);
            else     resolve();
          });
        }),
      );
    } catch (err) {
      // Destroy pool on failed login
      await new Promise<void>((resolve) => pool.clear(() => resolve()));
      this.logger.warn(`Login failed for ${dto.user}@${dto.host}: ${(err as Error).message}`);
      throw new UnauthorizedException(
        `HANA login failed: ${(err as Error).message}`,
      );
    }

    const token = crypto.randomBytes(32).toString('hex');
    this.sessions.set(token, {
      user:      dto.user,
      host:      dto.host,
      port:      dto.port,
      database:  dto.database,
      pool,
      createdAt: new Date(),
    });

    this.logger.log(`Session created for ${dto.user}@${dto.host}:${dto.port}`);
    return { token, user: dto.user, host: dto.host, port: dto.port };
  }

  async logout(token: string): Promise<void> {
    const session = this.sessions.get(token);
    if (!session) return;

    await new Promise<void>((resolve) => {
      session.pool.clear((err) => {
        if (err) this.logger.warn('Error clearing session pool', err);
        resolve();
      });
    });

    this.sessions.delete(token);
    this.logger.log(`Session closed for ${session.user}@${session.host}`);
  }

  getSession(token: string): SessionEntry | undefined {
    const session = this.sessions.get(token);
    if (!session) return undefined;
    if (Date.now() - session.createdAt.getTime() > SESSION_TTL_MS) {
      // Expired — clean up asynchronously and treat as missing
      this.logout(token).catch(() => {});
      return undefined;
    }
    return session;
  }

  getSessionInfo(token: string): SessionInfo | undefined {
    const session = this.getSession(token);
    if (!session) return undefined;
    return {
      user:     session.user,
      host:     session.host,
      port:     session.port,
      database: session.database,
    };
  }
}
