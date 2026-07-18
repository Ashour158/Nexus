import { NexusConsumer } from '@nexus/kafka';
import type { NexusProducer } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import { AUTOMATION_MODULES, createAutomationRulesService } from '../services/automation-rules.service.js';
import { AUTOMATION_TOPICS, makeAutomationHandler } from './automation.consumer.js';

/**
 * AU-4 / WF-OPS DLQ intake + replay path.
 *
 * When the live automation consumer exhausts its retries on a transient failure,
 * the ORIGINAL event is parked on `<topic>.dlq` (by the NexusConsumer DLQ
 * machinery, with the error + original topic/partition/offset in the message
 * headers). This consumer subscribes to those `.dlq` topics and, for every parked
 * message:
 *
 *   1. PERSISTS it as a `DeadLetterEvent` row (PENDING) so an operator can inspect
 *      and replay it from the `/api/v1/dlq` admin surface. This is the default,
 *      always-on behaviour and is fail-safe: a bad row is logged and skipped, it
 *      never crashes the consumer loop.
 *   2. Optionally AUTO re-drives it through the SAME `handleEvent` path when
 *      `AUTOMATION_DLQ_REPLAY_ENABLED=true` (legacy opt-in background reprocessor).
 *
 * Replay (manual or auto) is safe/idempotent: `handleEvent` skips runs that already
 * reached SUCCESS/PARTIAL and only re-executes runs left in FAILED (where no action
 * had succeeded, so nothing is double-applied).
 *
 * Guardrails:
 *   - `dlqEnabled: false` here — a still-broken event is NOT forwarded to a
 *     `.dlq.dlq`; persistence + logging happen and the offset advances, so intake
 *     cannot loop forever.
 *   - Persistence is idempotent on `(tenantId, dedupeKey)` where dedupeKey is
 *     `<originalTopic>:<partition>:<offset>` — a handler retry / consumer restart
 *     upserts the same row rather than duplicating it.
 */

type RawHeaders = Record<string, unknown> | undefined;

/** Coerce one kafkajs header (Buffer | Buffer[] | string | undefined) to a string. */
function headerStr(headers: RawHeaders, key: string): string | undefined {
  const v = headers?.[key];
  if (v == null) return undefined;
  if (Buffer.isBuffer(v)) return v.toString('utf8');
  if (Array.isArray(v)) return v.map((x) => (Buffer.isBuffer(x) ? x.toString('utf8') : String(x))).join(',');
  return String(v);
}

/** Flatten all kafkajs headers into a plain string map for JSON storage. */
function headersToJson(headers: RawHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (v == null) continue;
    out[k] = Buffer.isBuffer(v)
      ? v.toString('utf8')
      : Array.isArray(v)
        ? v.map((x) => (Buffer.isBuffer(x) ? x.toString('utf8') : String(x))).join(',')
        : String(v);
  }
  return out;
}

/**
 * Build the persistence handler that captures each parked DLQ message into a
 * `DeadLetterEvent` row. Fully fail-safe — any error is caught + logged so the
 * consumer loop is never interrupted by a bad row.
 */
export function makeDlqPersistHandler(prisma: WorkflowPrisma, attemptsDefault: number) {
  return async (
    event: { type?: string; tenantId?: string; eventId?: string; [key: string]: unknown },
    rawMessage?: { headers?: Record<string, unknown> }
  ): Promise<void> => {
    try {
      const headers = rawMessage?.headers;
      const tenantId = typeof event.tenantId === 'string' ? event.tenantId : '';
      if (!tenantId) return; // cannot persist without a tenant scope

      // Original (source) topic the event must replay onto — the DLQ machinery
      // always stamps this. Fall back to stripping any `.dlq` suffix if absent.
      const originalTopic = headerStr(headers, 'originalTopic') ?? 'unknown';
      const partition = headerStr(headers, 'originalPartition') ?? '0';
      const offset = headerStr(headers, 'originalOffset');
      const eventId = typeof event.eventId === 'string' ? event.eventId : undefined;
      // Stable identity for this exact parked message (topic:partition:offset is
      // globally unique in Kafka). Fall back to eventId when offset is missing.
      const dedupeKey = offset != null ? `${originalTopic}:${partition}:${offset}` : `evt:${eventId ?? 'unknown'}`;

      const error = headerStr(headers, 'errorMessage') ?? 'unknown error';
      const attemptsHeader = Number(headerStr(headers, 'attempts'));
      const attempts = Number.isFinite(attemptsHeader) ? attemptsHeader : attemptsDefault;

      await prisma.deadLetterEvent.upsert({
        where: { tenantId_dedupeKey: { tenantId, dedupeKey } },
        create: {
          tenantId,
          topic: originalTopic,
          eventType: typeof event.type === 'string' ? event.type : 'unknown',
          eventId,
          // The full original envelope — republished verbatim on replay.
          payload: event as unknown as object,
          headers: headersToJson(headers),
          error,
          attempts,
          status: 'PENDING',
          dedupeKey,
        },
        // Re-park of the same parked message (handler retry): refresh the error /
        // attempt count but never resurrect a REPLAYED/DISCARDED row to PENDING.
        update: { error, attempts },
      });
    } catch (err) {
      console.error('[dlq] Failed to persist dead-letter event (skipped):', err);
    }
  };
}

export async function startAutomationDlqReplayConsumer(
  prisma: WorkflowPrisma,
  producer?: NexusProducer
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer({
    groupId: 'workflow-service.automation-rules.dlq-replay',
    dlqEnabled: false,
    maxRetries: Number(process.env.AUTOMATION_DLQ_REPLAY_RETRIES ?? 1),
  });
  const rules = createAutomationRulesService(prisma, producer);
  const replay = makeAutomationHandler(rules);
  const attemptsDefault = Number(process.env.AUTOMATION_MAX_RETRIES ?? 3) + 1;
  const persist = makeDlqPersistHandler(prisma, attemptsDefault);
  // Legacy opt-in: also auto re-drive each parked event as it lands. Off by
  // default — persistence + the admin replay surface are the normal path.
  const autoReplayEnabled = process.env.AUTOMATION_DLQ_REPLAY_ENABLED === 'true';

  const onDlqMessage = async (
    event: { type: string; tenantId: string; eventId?: string; payload: Record<string, unknown>; [key: string]: unknown },
    rawMessage?: { headers?: Record<string, unknown> }
  ): Promise<void> => {
    // Persist first (fail-safe) so the operator always has a record, even if the
    // auto re-drive below throws and the message is retried.
    await persist(event, rawMessage);
    if (autoReplayEnabled) {
      await replay(event, rawMessage);
    }
  };

  const allEvents = new Set<string>(Object.values(AUTOMATION_MODULES).flat());
  for (const type of allEvents) {
    consumer.on(type, onDlqMessage as never);
  }

  await consumer.subscribe(AUTOMATION_TOPICS.map((t) => `${t}.dlq`));
  await consumer.start();
  return consumer;
}
