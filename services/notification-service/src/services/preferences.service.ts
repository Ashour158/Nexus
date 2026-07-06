import type { NotificationPrisma } from '../prisma.js';
import type { NotificationChannel } from '../../../../node_modules/.prisma/notification-client/index.js';

/**
 * Notification preferences (NOT-11) — per-user, per-channel opt-out.
 *
 * Opt-out model: the ABSENCE of a row means the channel is ENABLED. A row is
 * only written when a user explicitly toggles a channel. This keeps the default
 * behaviour (everything on) without any per-user seeding.
 *
 * Enforcement is FAIL-OPEN: `isChannelEnabled` returns `true` on any lookup
 * error, so a pref-check failure can never drop a notification. In-app is always
 * treated as enabled (the inbox is the system of record) regardless of any row.
 *
 * A tiny in-memory TTL cache absorbs the per-fan-out lookups (each consumer
 * event checks several channels for one recipient) without a persistent store.
 */

export const NOTIFICATION_CHANNELS = [
  'IN_APP',
  'EMAIL',
  'SMS',
  'PUSH',
  'WHATSAPP',
] as const satisfies readonly NotificationChannel[];

export type EffectivePreferences = Record<NotificationChannel, boolean>;

/** Channels that always send regardless of preference (the in-app inbox). */
const ALWAYS_ON: ReadonlySet<NotificationChannel> = new Set(['IN_APP']);

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  value: EffectivePreferences;
  expiresAt: number;
}

export function createPreferencesService(prisma: NotificationPrisma) {
  // key = `${tenantId}:${userId}` → effective map
  const cache = new Map<string, CacheEntry>();

  function cacheKey(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }

  function invalidate(tenantId: string, userId: string): void {
    cache.delete(cacheKey(tenantId, userId));
  }

  /**
   * Effective per-channel map for a user. Defaults every channel to enabled,
   * then applies any explicit opt-out rows. Fail-open: on a DB error we return
   * all-enabled so notifications keep flowing.
   */
  async function getEffectivePreferences(
    tenantId: string,
    userId: string
  ): Promise<EffectivePreferences> {
    const key = cacheKey(tenantId, userId);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const effective = Object.fromEntries(
      NOTIFICATION_CHANNELS.map((c) => [c, true])
    ) as EffectivePreferences;

    try {
      const rows = await prisma.notificationPreference.findMany({
        where: { tenantId, userId },
        select: { channel: true, enabled: true },
      });
      for (const row of rows) {
        effective[row.channel] = row.enabled;
      }
    } catch {
      // Fail-open: keep the all-enabled default. Do NOT cache a failure.
      return effective;
    }

    cache.set(key, { value: effective, expiresAt: Date.now() + CACHE_TTL_MS });
    return effective;
  }

  /**
   * Whether a single channel is enabled for a recipient. In-app is always on.
   * FAIL-OPEN: returns `true` on any error so a pref-check never drops a send.
   */
  async function isChannelEnabled(
    tenantId: string,
    userId: string,
    channel: NotificationChannel
  ): Promise<boolean> {
    if (ALWAYS_ON.has(channel)) return true;
    try {
      const prefs = await getEffectivePreferences(tenantId, userId);
      return prefs[channel] ?? true;
    } catch {
      return true;
    }
  }

  /** Upsert a single channel's enabled flag for a user. */
  async function setChannelEnabled(
    tenantId: string,
    userId: string,
    channel: NotificationChannel,
    enabled: boolean
  ): Promise<EffectivePreferences> {
    await prisma.notificationPreference.upsert({
      where: { tenantId_userId_channel: { tenantId, userId, channel } },
      create: { tenantId, userId, channel, enabled },
      update: { enabled },
    });
    invalidate(tenantId, userId);
    return getEffectivePreferences(tenantId, userId);
  }

  return {
    getEffectivePreferences,
    isChannelEnabled,
    setChannelEnabled,
    invalidate,
  };
}

export type PreferencesService = ReturnType<typeof createPreferencesService>;
