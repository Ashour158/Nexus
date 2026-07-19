import { runCrossTenant } from '@nexus/service-utils/prisma-tenant';
import type { CrmPrisma } from '../prisma.js';
import type { NexusProducer } from '@nexus/kafka';
import { enrichAccount, enrichContact } from './enrichment.engine.js';

/**
 * Scheduled re-enrichment poller (additive, FAIL-OPEN).
 *
 * Periodically re-enriches STALE accounts and contacts — records whose most
 * recent EnrichmentJob is older than `staleDays`, or that have never been
 * enriched at all — in small capped batches. Gated on a provider key being
 * configured (the enrichment engine itself no-ops without one, but we skip the
 * whole scan to avoid churning EnrichmentJob rows for nothing).
 *
 * SAFETY (mirrors rotten-deals.poller.ts):
 *  - the whole tick is wrapped in try/catch; a failing tick logs and returns.
 *  - the interval is unref()'d so it never keeps the process alive.
 *  - per-record failures are swallowed so one bad record can't stall the tick.
 *  - batched + capped so a large backlog can't monopolise the DB.
 */

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const DEFAULT_STALE_DAYS = 30;
const MAX_PER_TICK = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface StaleEnrichmentPoller {
  stop(): void;
  /** Exposed for tests: run one pass, return counts. */
  runOnce(): Promise<{ accounts: number; contacts: number }>;
}

function hasProviderKey(): boolean {
  return Boolean(process.env.CLEARBIT_API_KEY || process.env.APOLLO_API_KEY);
}

/**
 * Finds the set of entityIds (of `entityType`) that have a COMPLETED/PROCESSING
 * enrichment job newer than the cutoff — i.e. records that are still "fresh".
 */
async function freshEntityIds(
  prisma: CrmPrisma,
  entityType: 'ACCOUNT' | 'CONTACT',
  cutoff: Date
): Promise<Set<string>> {
  const jobs = await prisma.enrichmentJob.findMany({
    where: {
      entityType,
      status: { in: ['COMPLETED', 'PROCESSING', 'SKIPPED'] },
      createdAt: { gte: cutoff },
    },
    select: { entityId: true },
  });
  return new Set(jobs.map((j) => j.entityId));
}

async function reEnrichBatch(
  prisma: CrmPrisma,
  producer: NexusProducer,
  staleDays: number
): Promise<{ accounts: number; contacts: number }> {
  if (!hasProviderKey()) return { accounts: 0, contacts: 0 };

  const cutoff = new Date(Date.now() - staleDays * DAY_MS);

  // Accounts: oldest-updated first; skip those enriched within the window.
  const accountCandidates = await prisma.account.findMany({
    select: { id: true, tenantId: true },
    orderBy: { updatedAt: 'asc' },
    take: MAX_PER_TICK * 3,
  });
  const freshAccounts = await freshEntityIds(prisma, 'ACCOUNT', cutoff);
  const staleAccounts = accountCandidates.filter((a) => !freshAccounts.has(a.id)).slice(0, MAX_PER_TICK);

  let accountCount = 0;
  for (const a of staleAccounts) {
    try {
      await enrichAccount(prisma, a.tenantId, a.id, producer);
      accountCount += 1;
    } catch {
      // Never let one record abort the scan.
    }
  }

  const contactCandidates = await prisma.contact.findMany({
    select: { id: true, tenantId: true },
    orderBy: { updatedAt: 'asc' },
    take: MAX_PER_TICK * 3,
  });
  const freshContacts = await freshEntityIds(prisma, 'CONTACT', cutoff);
  const staleContacts = contactCandidates.filter((c) => !freshContacts.has(c.id)).slice(0, MAX_PER_TICK);

  let contactCount = 0;
  for (const c of staleContacts) {
    try {
      await enrichContact(prisma, c.tenantId, c.id, producer);
      contactCount += 1;
    } catch {
      // Swallow per-record failures.
    }
  }

  return { accounts: accountCount, contacts: contactCount };
}

export function startStaleEnrichmentPoller(
  prisma: CrmPrisma,
  producer: NexusProducer,
  opts: { intervalMs?: number; staleDays?: number } = {}
): StaleEnrichmentPoller {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const staleDays = opts.staleDays ?? DEFAULT_STALE_DAYS;

  const runOnce = async (): Promise<{ accounts: number; contacts: number }> => {
    try {
      return await reEnrichBatch(prisma, producer, staleDays);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[stale-enrichment] poller tick failed; continuing', err);
      return { accounts: 0, contacts: 0 };
    }
  };

  const timer = setInterval(() => {
    void runCrossTenant('stale-enrichment sweep scans accounts/contacts across all tenants', runOnce);
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    stop() {
      clearInterval(timer);
    },
    runOnce,
  };
}
