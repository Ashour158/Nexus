/**
 * In-memory rate limiter for Socket.IO deal events.
 */

import type { Socket } from 'socket.io';
import type { AuthedSocket } from './auth.middleware.js';

const LIMIT = 30;
const WINDOW_MS = 60_000;
const CLEANUP_INTERVAL_MS = 60_000;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function now(): number {
  return Date.now();
}

function cleanup(): void {
  const current = now();
  for (const [userId, entry] of rateLimitMap.entries()) {
    if (entry.resetAt < current) {
      rateLimitMap.delete(userId);
    }
  }
}

setInterval(cleanup, CLEANUP_INTERVAL_MS).unref();

/**
 * Checks whether the user associated with the socket has exceeded the
 * rate limit for deal room operations.  Returns `true` if rate-limited.
 */
export function rateLimitDealEvent(socket: Socket): boolean {
  const authed = socket as AuthedSocket;
  const userId = authed.data.user.sub;
  const current = now();

  const entry = rateLimitMap.get(userId);
  if (!entry || current > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: current + WINDOW_MS });
    return false;
  }

  entry.count += 1;
  if (entry.count > LIMIT) {
    return true;
  }

  return false;
}
