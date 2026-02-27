import { Logger } from '@nestjs/common';
import * as hana from '@sap/hana-client';

const logger = new Logger('PoolUtils');

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS     = 2000;

/**
 * Get a connection from the pool, run fn(conn), then return it to the pool.
 */
export async function withPoolConnection<T>(
  pool: hana.ConnectionPool,
  fn: (conn: hana.Connection) => Promise<T>,
): Promise<T> {
  const conn = await new Promise<hana.Connection>((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err || !connection) {
        reject(err ?? new Error('Failed to get connection from pool'));
      } else {
        resolve(connection);
      }
    });
  });

  try {
    return await fn(conn);
  } finally {
    conn.close((err) => {
      if (err) logger.warn('Error returning connection to pool', err);
    });
  }
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('socket hang up')  ||
    msg.includes('econnreset')      ||
    msg.includes('econnrefused')    ||
    msg.includes('etimedout')       ||
    msg.includes('connection lost') ||
    msg.includes('connection closed')
  );
}

/**
 * Retry fn up to attempts times on transient network errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = MAX_RECONNECT_ATTEMPTS,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isNetworkError(err) || i === attempts - 1) throw err;
      const delay = RECONNECT_DELAY_MS * Math.pow(2, i);
      logger.warn(
        `Network error on attempt ${i + 1}/${attempts}, retrying in ${delay}ms…`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
