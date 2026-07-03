import { NexusConsumer, TOPICS } from '@nexus/kafka';
import type { CrmPrisma } from '../prisma.js';
import {
  recalculateAccountHealth,
} from '../lib/lead-scoring.engine.js';
import { DeterministicScoringEngine } from '../lib/deterministic-scoring.engine.js';

type EventWithPayload = {
  tenantId?: string;
  payload?: Record<string, unknown>;
};

function getTenantId(event: EventWithPayload): string | undefined {
  return event.tenantId ?? (typeof event.payload?.tenantId === 'string' ? event.payload.tenantId : undefined);
}

export async function startScoringConsumer(prisma: CrmPrisma): Promise<NexusConsumer> {
  const consumer = new NexusConsumer('crm-scoring-group');
  await consumer.subscribe([TOPICS.ACTIVITIES, TOPICS.LEADS, TOPICS.DEALS]);

  consumer.on('activity.created', async (event) => {
    const e = event as unknown as EventWithPayload;
    const tenantId = getTenantId(e);
    const leadId = (e.payload?.leadId as string | undefined) ?? (e.payload?.entityId as string | undefined);
    const accountId = e.payload?.accountId as string | undefined;
    if (!tenantId) return;

    if (leadId) {
      // Use deterministic scoring for leads
      const scoringEngine = new DeterministicScoringEngine(prisma, tenantId);
      await scoringEngine.recalculateScoreRealTime(leadId);
    }

    if (accountId) {
      await recalculateAccountHealth(prisma, tenantId, accountId);
    }
  });

  consumer.on('lead.created', async (event) => {
    const e = event as unknown as EventWithPayload;
    const tenantId = getTenantId(e);
    const leadId = (e.payload?.leadId as string | undefined) ?? (e.payload?.id as string | undefined);
    if (!tenantId || !leadId) return;

    // Use deterministic scoring for new leads
    const scoringEngine = new DeterministicScoringEngine(prisma, tenantId);
    await scoringEngine.recalculateScoreRealTime(leadId);
  });

  consumer.on('lead.updated', async (event) => {
    const e = event as unknown as EventWithPayload;
    const tenantId = getTenantId(e);
    const leadId = (e.payload?.leadId as string | undefined) ?? (e.payload?.id as string | undefined);
    if (!tenantId || !leadId) return;

    // Recalculate score on lead updates (e.g., new contact info, company changes)
    const scoringEngine = new DeterministicScoringEngine(prisma, tenantId);
    await scoringEngine.recalculateScoreRealTime(leadId);
  });

  consumer.on('deal.updated', async (event) => {
    const e = event as unknown as EventWithPayload;
    const tenantId = getTenantId(e);
    const accountId = e.payload?.accountId as string | undefined;
    if (!tenantId || !accountId) return;
    await recalculateAccountHealth(prisma, tenantId, accountId);
  });

  // New event handlers for enhanced scoring triggers
  consumer.on('email.opened', async (event) => {
    const e = event as unknown as EventWithPayload;
    const tenantId = getTenantId(e);
    const leadId = e.payload?.leadId as string;
    if (!tenantId || !leadId) return;

    const scoringEngine = new DeterministicScoringEngine(prisma, tenantId);
    await scoringEngine.recalculateScoreRealTime(leadId);
  });

  consumer.on('page.viewed', async (event) => {
    const e = event as unknown as EventWithPayload;
    const tenantId = getTenantId(e);
    const leadId = e.payload?.leadId as string;
    if (!tenantId || !leadId) return;

    const scoringEngine = new DeterministicScoringEngine(prisma, tenantId);
    await scoringEngine.recalculateScoreRealTime(leadId);
  });

  consumer.on('content.downloaded', async (event) => {
    const e = event as unknown as EventWithPayload;
    const tenantId = getTenantId(e);
    const leadId = e.payload?.leadId as string;
    if (!tenantId || !leadId) return;

    const scoringEngine = new DeterministicScoringEngine(prisma, tenantId);
    await scoringEngine.recalculateScoreRealTime(leadId);
  });

  await consumer.start();
  return consumer;
}
