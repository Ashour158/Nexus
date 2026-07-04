import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { PrismaClient } from '../../../../node_modules/.prisma/accounts-client/index.js';
import { applyDealHealthEvent, toDealHealthEvent } from '../services/account-health.service.js';

interface LoggerLike {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/**
 * Start the account-health Kafka consumer. Subscribes to the DEALS topic and
 * maintains an {@link AccountHealthScore} per account from deal lifecycle
 * events (`deal.created` / `deal.won` / `deal.lost` / `deal.stage_changed`).
 *
 * Every handler is fully guarded via {@link applyDealHealthEvent}, and the
 * whole start-up is designed to be wrapped in try/catch by the caller: if
 * Kafka is unavailable the service must still boot and serve HTTP traffic.
 *
 * `deal.lost` / `deal.stage_changed` events do not always carry an
 * `accountId`; those are skipped silently rather than crashing.
 */
export async function startAccountHealthConsumer(
  prisma: PrismaClient,
  log: LoggerLike
): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('accounts-service.deal-health');

  const handle = async (event: {
    type?: string;
    tenantId?: string;
    payload?: unknown;
  }): Promise<void> => {
    const payload =
      event.payload && typeof event.payload === 'object'
        ? (event.payload as Record<string, unknown>)
        : {};
    const normalized = toDealHealthEvent(event.type, event.tenantId, payload);
    if (!normalized) return;
    // No accountId → cannot attribute to an account. Skip (guarded in service).
    await applyDealHealthEvent(prisma, log, normalized);
  };

  consumer.on('deal.created', handle);
  consumer.on('deal.won', handle);
  consumer.on('deal.lost', handle);
  consumer.on('deal.stage_changed', handle);

  await consumer.subscribe([TOPICS.DEALS]);
  await consumer.start();
  return consumer;
}
