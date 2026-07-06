import { createRedisClient } from '@nexus/service-utils';

/**
 * Redis-backed brute-force lockout for password logins.
 *
 * After MAX_ATTEMPTS consecutive failures for an email within WINDOW_SEC, further
 * attempts are rejected with a 429 until the window expires. A successful login
 * clears the counter. All Redis calls fail OPEN — if Redis is unavailable, login
 * proceeds normally rather than locking everyone out.
 */
const redis = createRedisClient();

const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5);
const WINDOW_SEC = Number(process.env.LOGIN_LOCKOUT_SECONDS ?? 900); // 15 minutes

const keyFor = (email: string) => `login:fail:${email.trim().toLowerCase()}`;

export interface LoginLockStatus {
  locked: boolean;
  retryAfterSec: number;
}

/** Returns whether the email is currently locked out (and for how long). */
export async function getLoginLock(email: string): Promise<LoginLockStatus> {
  try {
    const key = keyFor(email);
    const count = Number(await redis.get(key)) || 0;
    if (count >= MAX_ATTEMPTS) {
      const ttl = await redis.ttl(key);
      return { locked: true, retryAfterSec: ttl > 0 ? ttl : WINDOW_SEC };
    }
  } catch {
    /* fail open */
  }
  return { locked: false, retryAfterSec: 0 };
}

/** Record a failed attempt; sets the expiry window on the first failure. */
export async function recordLoginFailure(email: string): Promise<void> {
  try {
    const key = keyFor(email);
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, WINDOW_SEC);
  } catch {
    /* fail open */
  }
}

/** Clear the counter after a successful login. */
export async function clearLoginFailures(email: string): Promise<void> {
  try {
    await redis.del(keyFor(email));
  } catch {
    /* fail open */
  }
}
