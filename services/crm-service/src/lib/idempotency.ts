/**
 * Idempotency-Key support for core CRM create endpoints.
 *
 * A client may send an `Idempotency-Key` (or `x-idempotency-key`) header on a
 * POST so a retried request — after a dropped connection, a proxy retry, a
 * double-click — returns the ORIGINAL result instead of creating a duplicate
 * record.
 *
 * Storage is per tenant, keyed by `{tenantId}:{key}`:
 *   1. Redis via the shared cache ({@link getSharedCache}) — primary, TTL-bounded.
 *   2. The `IdempotencyKey` DB table — durable fallback when Redis is down.
 *
 * The stored value is the full HTTP outcome (`{ statusCode, body }`) so the
 * replay is byte-for-byte the original success response. Errors are NOT stored:
 * `compute()` throwing propagates out untouched, so a failed create can be
 * retried and a validation/conflict error is never cached.
 */

import type { FastifyRequest } from 'fastify';
import { getSharedCache } from '@nexus/cache';
import type { CrmPrisma } from '../prisma.js';

export interface IdempotentResult {
  statusCode: number;
  body: unknown;
}

/** Replayed results live for 24h; well beyond any realistic client retry window. */
const TTL_MS = 24 * 60 * 60 * 1000;

function readKey(request: FastifyRequest): string | null {
  const headers = request.headers as Record<string, string | string[] | undefined>;
  const raw = headers['idempotency-key'] ?? headers['x-idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = (value ?? '').toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function lookup(prisma: CrmPrisma, scopedKey: string): Promise<IdempotentResult | null> {
  // Redis first (fast path). Any failure (unavailable, mocked-out in tests)
  // silently degrades to the DB.
  try {
    if (typeof getSharedCache === 'function') {
      const cached = await getSharedCache().get<IdempotentResult>(`crm:idem:${scopedKey}`);
      if (cached) return cached;
    }
  } catch {
    // fall through to DB
  }

  try {
    // `key` is unique per tenant; the tenant extension scopes the where by
    // tenantId, so a bare `findFirst({ where: { key } })` is tenant-safe.
    const row = await prisma.idempotencyKey.findFirst({
      where: { key: scopedKey },
      select: { statusCode: true, response: true },
    });
    if (row) return { statusCode: row.statusCode, body: row.response };
  } catch {
    // table may not exist yet (pre-migration) — treat as a cache miss
  }
  return null;
}

async function persist(
  prisma: CrmPrisma,
  tenantId: string,
  scopedKey: string,
  result: IdempotentResult
): Promise<void> {
  try {
    if (typeof getSharedCache === 'function') {
      await getSharedCache().set(`crm:idem:${scopedKey}`, result, TTL_MS);
    }
  } catch {
    // non-fatal — the DB row below is the durable copy
  }

  try {
    // tenantId is also injected by the tenant Prisma extension; passing it here
    // satisfies the static create type and keeps the row correct if the
    // extension is ever bypassed.
    await prisma.idempotencyKey.create({
      data: {
        tenantId,
        key: scopedKey,
        statusCode: result.statusCode,
        response: result.body as never,
      },
    });
  } catch {
    // Unique-violation (a concurrent request won the race) or missing table —
    // both are safe to ignore: the winner's row/Redis entry backs future replays.
  }
}

/**
 * Runs `compute()` under idempotency protection. When the request carries no
 * idempotency header, `compute()` runs directly (no storage overhead). When it
 * does, a prior stored result is replayed if present; otherwise `compute()` runs
 * once and its result is persisted for future replays.
 *
 * The key is scoped by `tenantId` so keys never collide across tenants.
 */
export async function withIdempotency(
  prisma: CrmPrisma,
  request: FastifyRequest,
  tenantId: string,
  compute: () => Promise<IdempotentResult>
): Promise<IdempotentResult> {
  const key = readKey(request);
  if (!key) return compute();

  const scopedKey = `${tenantId}:${key}`;
  const prior = await lookup(prisma, scopedKey);
  if (prior) return prior;

  const result = await compute();
  await persist(prisma, tenantId, scopedKey, result);
  return result;
}
