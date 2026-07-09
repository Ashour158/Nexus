/**
 * Socket.IO room authorization helpers with Redis-backed caching.
 */

import type { Socket } from 'socket.io';
import type { AuthedSocket } from './auth.middleware.js';
import { createRedisClient } from '@nexus/service-utils';

const CRM_URL = process.env.CRM_SERVICE_URL ?? 'http://crm-service:3001/api/v1';
const CACHE_TTL_SECONDS = 300;

const redis = createRedisClient({
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  connectTimeout: 5000,
  enableOfflineQueue: false,
  keepAlive: 30000,
});

let redisAvailable = false;

redis
  .connect()
  .then(() => {
    redisAvailable = true;
  })
  .catch(() => {
    redisAvailable = false;
  });

redis.on('error', () => {
  redisAvailable = false;
});

redis.on('connect', () => {
  redisAvailable = true;
});

function cacheKey(dealId: string, userId: string): string {
  return `deal_auth:${dealId}:${userId}`;
}

async function fetchDealFromCRM(
  dealId: string,
  token: string,
  tenantId: string
): Promise<{ tenantId?: string } | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${CRM_URL}/deals/${dealId}`, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId,
      },
    });

    if (!res.ok) {
      return undefined;
    }

    return (await res.json()) as { tenantId?: string } | undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function authorizeDealRoom(
  socket: Socket,
  dealId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const authed = socket as AuthedSocket;
  const user = authed.data.user;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(dealId)) {
    return { allowed: false, reason: 'INVALID_DEAL_ID' };
  }

  const key = cacheKey(dealId, user.sub);
  let cachedValue: string | null = null;

  if (redisAvailable) {
    try {
      cachedValue = await redis.get(key);
    } catch {
      // Redis unavailable — fall through to direct CRM call
    }
  }

  if (cachedValue !== null) {
    if (cachedValue === 'FORBIDDEN') {
      return { allowed: false, reason: 'FORBIDDEN' };
    }

    if (cachedValue !== user.tenantId) {
      return { allowed: false, reason: 'TENANT_MISMATCH' };
    }

    // Check permissions — explicit deals:read required
    const permissions = user.permissions ?? [];
    const hasDealRead = permissions.includes('deals:read');
    if (!hasDealRead) {
      return { allowed: false, reason: 'MISSING_PERMISSION' };
    }

    return { allowed: true };
  }

  // Cache miss or Redis unavailable — call CRM service
  try {
    const deal = await fetchDealFromCRM(dealId, authed.data.token ?? '', user.tenantId);

    if (!deal) {
      if (redisAvailable) {
        try {
          await redis.setex(key, CACHE_TTL_SECONDS, 'FORBIDDEN');
        } catch {
          // Ignore cache-write failure
        }
      }
      return { allowed: false, reason: 'DEAL_NOT_FOUND' };
    }

    if (deal.tenantId !== user.tenantId) {
      if (redisAvailable) {
        try {
          await redis.setex(key, CACHE_TTL_SECONDS, 'FORBIDDEN');
        } catch {
          // Ignore cache-write failure
        }
      }
      return { allowed: false, reason: 'TENANT_MISMATCH' };
    }

    // Check permissions — explicit deals:read required
    const permissions = user.permissions ?? [];
    const hasDealRead = permissions.includes('deals:read');
    if (!hasDealRead) {
      if (redisAvailable) {
        try {
          await redis.setex(key, CACHE_TTL_SECONDS, 'FORBIDDEN');
        } catch {
          // Ignore cache-write failure
        }
      }
      return { allowed: false, reason: 'MISSING_PERMISSION' };
    }

    if (redisAvailable) {
      try {
        await redis.setex(key, CACHE_TTL_SECONDS, deal.tenantId);
      } catch {
        // Ignore cache-write failure
      }
    }

    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'AUTHORIZATION_ERROR' };
  }
}
