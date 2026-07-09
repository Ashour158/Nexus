import type * as Minio from 'minio';
import type { StoragePrisma } from '../prisma.js';

/**
 * Orphan object reconciliation poller (additive, FAIL-OPEN, DISABLED by default).
 *
 * Reconciles MinIO objects against `FileAttachment` DB rows and removes true
 * orphans: objects present in the bucket that have NO matching DB record and are
 * older than a grace window. These arise when an upload writes the object to
 * MinIO but the subsequent DB row create fails (partial-failure garbage) — the
 * download/list endpoints can never surface such objects, so they are dead bytes.
 *
 * SAFETY (mirrors the activities reminders poller):
 *  - Whole tick wrapped in try/catch; a failing tick logs a warning and returns.
 *  - Reentrancy guard skips overlapping ticks while one is in flight.
 *  - The interval is `unref()`d so it never keeps the process alive on shutdown.
 *  - GRACE window: only objects older than STORAGE_ORPHAN_GRACE_MS are eligible,
 *    so an object created moments before its DB row is never treated as orphan.
 *  - Capped per tick (STORAGE_ORPHAN_BATCH) so a large bucket can't monopolise IO.
 *  - Per-object failures are swallowed so one bad object can't stall the tick.
 *  - Guarded by STORAGE_ORPHAN_CLEANUP_ENABLED — OFF unless explicitly enabled,
 *    since it deletes bucket objects.
 */

const DEFAULT_INTERVAL_MS = Number(process.env.STORAGE_ORPHAN_POLL_MS ?? 6 * 60 * 60 * 1000); // 6h
const GRACE_MS = Number(process.env.STORAGE_ORPHAN_GRACE_MS ?? 24 * 60 * 60 * 1000); // 24h
const MAX_PER_TICK = Number(process.env.STORAGE_ORPHAN_BATCH ?? 500);
const ENABLED = process.env.STORAGE_ORPHAN_CLEANUP_ENABLED === 'true';

export interface OrphanCleanupPoller {
  stop(): void;
  /** Exposed for tests: run a single pass, returning how many orphans were removed. */
  runOnce(): Promise<{ scanned: number; removed: number }>;
}

interface ScannedObject {
  name: string;
  lastModified?: Date;
}

async function listObjects(
  minio: Minio.Client,
  bucket: string,
  limit: number
): Promise<ScannedObject[]> {
  return new Promise((resolve, reject) => {
    const out: ScannedObject[] = [];
    const stream = minio.listObjectsV2(bucket, '', true);
    stream.on('data', (obj) => {
      if (out.length >= limit) return;
      if (obj.name) out.push({ name: obj.name, lastModified: obj.lastModified });
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(out));
  });
}

async function reconcile(
  prisma: StoragePrisma,
  minio: Minio.Client,
  bucket: string
): Promise<{ scanned: number; removed: number }> {
  const cutoff = Date.now() - GRACE_MS;
  const objects = await listObjects(minio, bucket, MAX_PER_TICK);
  let removed = 0;

  for (const obj of objects) {
    try {
      // Only consider objects settled past the grace window.
      const lm = obj.lastModified ? obj.lastModified.getTime() : 0;
      if (lm > cutoff) continue;

      const row = await prisma.fileAttachment.findFirst({
        where: { storedKey: obj.name },
        select: { id: true },
      });
      if (row) continue; // Has a DB record — not an orphan.

      await minio.removeObject(bucket, obj.name);
      removed += 1;
    } catch {
      // Never let a single object abort the scan.
    }
  }
  return { scanned: objects.length, removed };
}

/**
 * Starts the orphan cleanup poller. Returns a handle to stop it. Guarded so a
 * failed start (or any tick) can never break the service. Returns a no-op handle
 * when STORAGE_ORPHAN_CLEANUP_ENABLED is not 'true'.
 */
export function startOrphanCleanupPoller(
  prisma: StoragePrisma,
  minio: Minio.Client,
  bucket: string,
  opts: { intervalMs?: number; enabled?: boolean } = {}
): OrphanCleanupPoller {
  const enabled = opts.enabled ?? ENABLED;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  let running = false;

  const runOnce = async (): Promise<{ scanned: number; removed: number }> => {
    try {
      return await reconcile(prisma, minio, bucket);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[storage-orphan-cleanup] tick failed; continuing', err);
      return { scanned: 0, removed: 0 };
    }
  };

  if (!enabled) {
    return { stop() {}, runOnce };
  }

  const timer = setInterval(() => {
    if (running) return; // reentrancy guard
    running = true;
    void runOnce().finally(() => {
      running = false;
    });
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    stop() {
      clearInterval(timer);
    },
    runOnce,
  };
}
