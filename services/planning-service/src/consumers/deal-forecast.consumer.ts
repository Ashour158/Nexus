import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { PlanningPrisma } from '../prisma.js';
import {
  createForecastRollupService,
  normalizeDealEvent,
} from '../services/forecast-rollup.service.js';

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Start the forecast roll-up Kafka consumer. Subscribes to the DEALS topic and
 * maintains a per-owner/per-period {@link ForecastAggregate} from deal
 * lifecycle events (`deal.created` / `deal.updated` / `deal.stage_changed` /
 * `deal.won` / `deal.lost`).
 *
 * Fully fail-open: every handler is wrapped in try/catch and only warns, so a
 * malformed event or a transient DB blip never crashes the consumer loop. The
 * whole start-up is designed to be wrapped in try/catch by the caller: if Kafka
 * is unavailable the service must still boot and serve HTTP traffic.
 *
 * Idempotency is provided both by the shared NexusConsumer idempotency store
 * and, structurally, by the roll-up service (derived-state upsert + recompute).
 */
export async function startDealForecastConsumer(
  prisma: PlanningPrisma,
  log: LoggerLike
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('planning-service.deal-forecast');
  const rollup = createForecastRollupService(prisma);

  const handle = async (event: {
    type?: string;
    tenantId?: string;
    timestamp?: string;
    payload?: unknown;
  }): Promise<void> => {
    try {
      const payload =
        event.payload && typeof event.payload === 'object'
          ? (event.payload as Record<string, unknown>)
          : {};
      const normalized = normalizeDealEvent(
        event.type,
        event.tenantId,
        payload,
        event.timestamp
      );
      if (!normalized) return; // missing tenantId / dealId / ownerId — skip silently
      await rollup.apply(normalized);
    } catch (err) {
      log.warn('planning deal-forecast consumer handler error (suppressed)', err);
    }
  };

  consumer.on('deal.created', handle);
  consumer.on('deal.updated', handle);
  consumer.on('deal.stage_changed', handle);
  consumer.on('deal.won', handle);
  consumer.on('deal.lost', handle);

  await consumer.subscribe([TOPICS.DEALS]);
  await consumer.start();
  log.info('planning-service deal-forecast consumer started');
  return consumer;
}
