import type { NexusProducer } from '@nexus/kafka';
import type { NexusKafkaEvent } from '@nexus/shared-types';
import { NotFoundError, ValidationError } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';

/** Dead-letter lifecycle states (mirrors the Prisma `DeadLetterStatus` enum). */
export type DeadLetterStatus = 'PENDING' | 'REPLAYED' | 'DISCARDED';

const PAGE_SIZE = 25;
const BATCH_MAX = 100;
const PREVIEW_LEN = 500;

export interface DlqListFilter {
  status?: DeadLetterStatus;
  topic?: string;
  page?: number;
}

export interface ReplayResult {
  id: string;
  status: 'replayed' | 'skipped' | 'failed';
  reason?: string;
}

function truncate(value: string, len = PREVIEW_LEN): string {
  return value.length > len ? `${value.slice(0, len)}…` : value;
}

/**
 * WF-OPS admin service backing `/api/v1/dlq`. All queries are tenant-scoped
 * (explicit `tenantId` in every `where`). Replay re-publishes the ORIGINAL stored
 * envelope verbatim through `NexusProducer.publishBatch` so downstream consumers
 * process it exactly as the first time (eventId / correlationId / source / causation
 * all preserved). Replay is idempotent: the row is atomically claimed
 * (PENDING → REPLAYED) before publish, so a concurrent second request is a no-op.
 */
export function createDlqService(prisma: WorkflowPrisma, producer?: NexusProducer) {
  /** Shape a row for the list view (payload/error truncated to a preview). */
  function toPreview(row: {
    id: string;
    topic: string;
    eventType: string;
    eventId: string | null;
    error: string;
    attempts: number;
    status: string;
    payload: unknown;
    createdAt: Date;
    replayedAt: Date | null;
  }) {
    return {
      id: row.id,
      topic: row.topic,
      eventType: row.eventType,
      eventId: row.eventId,
      status: row.status,
      attempts: row.attempts,
      error: truncate(row.error),
      payloadPreview: truncate(JSON.stringify(row.payload ?? {})),
      createdAt: row.createdAt,
      replayedAt: row.replayedAt,
    };
  }

  return {
    /** Paginated list of dead-lettered events with an error + payload preview. */
    async list(tenantId: string, filter: DlqListFilter) {
      const page = Math.max(1, filter.page ?? 1);
      const where = {
        tenantId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.topic ? { topic: filter.topic } : {}),
      };
      const [rows, total] = await Promise.all([
        prisma.deadLetterEvent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        }),
        prisma.deadLetterEvent.count({ where }),
      ]);
      return {
        items: rows.map(toPreview),
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      };
    },

    /** Full detail of a single dead-lettered event (untruncated payload/headers). */
    async get(tenantId: string, id: string) {
      const row = await prisma.deadLetterEvent.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('Dead-letter event not found');
      return row;
    },

    /**
     * Re-publish one dead-lettered event's ORIGINAL envelope back onto its source
     * topic. Atomically claims the row (only a PENDING row can be claimed) before
     * publishing so it cannot be replayed twice; on publish failure the claim is
     * rolled back to PENDING so the operator can retry.
     */
    async replay(tenantId: string, id: string): Promise<ReplayResult> {
      const row = await prisma.deadLetterEvent.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('Dead-letter event not found');
      if (row.status !== 'PENDING') {
        throw new ValidationError(`Cannot replay a ${row.status} event`, {
          status: row.status,
        });
      }
      if (!producer) {
        throw new ValidationError('Replay is unavailable: no Kafka producer configured');
      }

      // Atomic claim — guards against a concurrent double-replay. Only flips a row
      // that is still PENDING; count 0 means another request already claimed it.
      const claim = await prisma.deadLetterEvent.updateMany({
        where: { id, tenantId, status: 'PENDING' },
        data: { status: 'REPLAYED', replayedAt: new Date() },
      });
      if (claim.count === 0) {
        return { id, status: 'skipped', reason: 'already handled' };
      }

      try {
        // publishBatch serializes the stored envelope verbatim (no eventId/source
        // regeneration), preserving the original event for downstream consumers.
        await producer.publishBatch(row.topic, [row.payload as unknown as NexusKafkaEvent]);
        return { id, status: 'replayed' };
      } catch (err) {
        // Roll the claim back so the event stays actionable.
        await prisma.deadLetterEvent
          .updateMany({
            where: { id, tenantId, status: 'REPLAYED' },
            data: { status: 'PENDING', replayedAt: null },
          })
          .catch(() => undefined);
        throw err;
      }
    },

    /** Mark a dead-lettered event DISCARDED (no re-publish). PENDING rows only. */
    async discard(tenantId: string, id: string) {
      const row = await prisma.deadLetterEvent.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('Dead-letter event not found');
      if (row.status !== 'PENDING') {
        throw new ValidationError(`Cannot discard a ${row.status} event`, { status: row.status });
      }
      const claim = await prisma.deadLetterEvent.updateMany({
        where: { id, tenantId, status: 'PENDING' },
        data: { status: 'DISCARDED' },
      });
      if (claim.count === 0) {
        throw new ValidationError('Event is no longer PENDING');
      }
      return { id, status: 'DISCARDED' as const };
    },

    /**
     * Replay every PENDING event for a topic (bounded to BATCH_MAX). Returns a
     * per-id result summary; a single failure never aborts the rest of the batch.
     */
    async replayBatch(tenantId: string, topic: string): Promise<{
      topic: string;
      attempted: number;
      replayed: number;
      failed: number;
      results: ReplayResult[];
    }> {
      if (!topic) throw new ValidationError('topic is required');
      const rows = await prisma.deadLetterEvent.findMany({
        where: { tenantId, topic, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: BATCH_MAX,
        select: { id: true },
      });

      const results: ReplayResult[] = [];
      for (const { id } of rows) {
        try {
          results.push(await this.replay(tenantId, id));
        } catch (err) {
          results.push({
            id,
            status: 'failed',
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return {
        topic,
        attempted: rows.length,
        replayed: results.filter((r) => r.status === 'replayed').length,
        failed: results.filter((r) => r.status === 'failed').length,
        results,
      };
    },

    /** Counts by topic + status for an ops dashboard. */
    async stats(tenantId: string) {
      const grouped = await prisma.deadLetterEvent.groupBy({
        by: ['topic', 'status'],
        where: { tenantId },
        _count: { _all: true },
      });

      const byTopic: Record<string, Record<string, number>> = {};
      const byStatus: Record<string, number> = { PENDING: 0, REPLAYED: 0, DISCARDED: 0 };
      let total = 0;
      for (const g of grouped) {
        const n = g._count._all;
        total += n;
        byStatus[g.status] = (byStatus[g.status] ?? 0) + n;
        byTopic[g.topic] ??= { PENDING: 0, REPLAYED: 0, DISCARDED: 0 };
        byTopic[g.topic][g.status] = n;
      }
      return { total, byStatus, byTopic };
    },
  };
}

export type DlqService = ReturnType<typeof createDlqService>;
