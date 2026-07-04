import type { NexusProducer } from '@nexus/kafka';
import type { PortalPrisma } from '../prisma.js';
import { emitPortalEngagement } from './portal-events.js';

type EntityType = 'QUOTE' | 'CONTRACT' | 'INVOICE' | 'ACCOUNT';

/**
 * Terminal decisions a portal recipient can make on a shared entity. Once an
 * entity has been accepted or rejected, the opposite (or a repeat) decision is
 * an illegal transition and must be rejected — this is derived from the
 * existing `PortalAuditLog` history so no schema change is required.
 */
type PortalDecision = 'accepted' | 'rejected';

export class IllegalPortalTransitionError extends Error {
  constructor(
    public readonly from: PortalDecision,
    public readonly to: PortalDecision
  ) {
    super(`Portal entity already ${from}; cannot ${to}.`);
    this.name = 'IllegalPortalTransitionError';
  }
}

function serviceFor(entityType: EntityType): string {
  if (entityType === 'ACCOUNT') return process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
  return process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3003';
}

/**
 * Request context captured from the portal HTTP request so the audit trail can
 * record who opened / acted on a shared link. Both fields are optional.
 */
export interface PortalRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Flips a shared quote SENT → VIEWED in finance-service (the authority for quote
 * status) when its portal link is opened. Uses the finance internal endpoint
 * guarded by `x-service-token`. NOT fire-and-forget: failures are surfaced as a
 * clear warning (with status/body) rather than silently swallowed, so a failed
 * flip is diagnosable. Never throws — a finance outage must not break the portal
 * read path — but it always logs.
 */
async function markQuoteViewedInFinance(
  tenantId: string,
  quoteId: string,
  token: string
): Promise<void> {
  const base = process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3003';
  const serviceToken = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  try {
    const res = await fetch(`${base}/api/v1/internal/quotes/${quoteId}/mark-viewed`, {
      method: 'POST',
      headers: {
        'x-service-token': serviceToken,
        'x-tenant-id': tenantId,
        'x-correlation-id': token,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.warn(
        `[portal-service] mark-viewed failed for quote ${quoteId}: HTTP ${res.status} ${body}`
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[portal-service] mark-viewed request errored for quote ${quoteId}:`, err);
  }
}

/**
 * Forwards a portal accept/reject decision to finance-service (the quote
 * authority). Returns `true` only when finance confirms the status flip.
 * Never throws (a finance outage must not roll back the recorded portal
 * decision), but ALWAYS logs a clear warning on failure so a swallowed flip is
 * diagnosable — the caller returns `statusFlipped` to the route so the portal
 * response reflects reality instead of a false success.
 */
async function forwardDecisionToFinance(
  entityType: EntityType,
  entityId: string,
  decision: 'accept' | 'reject',
  tenantId: string,
  token: string,
  reason?: string
): Promise<boolean> {
  const base = serviceFor(entityType);
  const serviceToken = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  try {
    const res = await fetch(`${base}/api/v1/quotes/${entityId}/${decision}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        'x-service-token': serviceToken,
        'x-tenant-id': tenantId,
        'x-correlation-id': token,
        'Content-Type': 'application/json',
      },
      body: decision === 'reject' ? JSON.stringify({ reason }) : undefined,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.warn(
        `[portal-service] finance ${decision} failed for quote ${entityId}: HTTP ${res.status} ${body} — quote status NOT flipped`
      );
      return false;
    }
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[portal-service] finance ${decision} request errored for quote ${entityId} — quote status NOT flipped:`,
      err
    );
    return false;
  }
}

export function createPortalService(prisma: PortalPrisma, producer?: NexusProducer | null) {
  const service = {
    async createToken(
      tenantId: string,
      entityType: EntityType,
      entityId: string,
      createdBy: string,
      expiresInDays: number
    ) {
      const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
      return prisma.portalToken.create({
        data: { tenantId, entityType, entityId, createdBy, expiresAt },
      });
    },

    async listTokens(tenantId: string, entityId?: string) {
      return prisma.portalToken.findMany({
        where: { tenantId, entityId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async deleteToken(tenantId: string, id: string) {
      return prisma.portalToken.deleteMany({ where: { tenantId, id } });
    },

    async getPortalContext(token: string, reqCtx: PortalRequestContext = {}) {
      const row = await prisma.portalToken.findUnique({ where: { token } });
      if (!row || row.expiresAt < new Date()) return null;
      await prisma.portalToken.update({
        where: { id: row.id },
        data: { viewCount: { increment: 1 } },
      });
      // Persist the view to the portal audit trail, populating ipAddress /
      // userAgent (columns that existed but were never written). Fail-open.
      await service
        .recordAction(token, 'viewed', row.tenantId, row.entityType, row.entityId, reqCtx)
        .catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.warn('[portal-service] failed to record portal view audit log:', err);
        });
      // For shared quotes, flip the quote SENT → VIEWED in finance (authority).
      if (row.entityType === 'QUOTE') {
        await markQuoteViewedInFinance(row.tenantId, row.entityId, row.token);
      }
      const base = serviceFor(row.entityType);
      const path =
        row.entityType === 'QUOTE'
          ? `/api/v1/quotes/${row.entityId}`
          : row.entityType === 'INVOICE'
            ? `/api/v1/invoices/${row.entityId}`
            : row.entityType === 'ACCOUNT'
              ? `/api/v1/accounts/${row.entityId}`
              : `/api/v1/contracts/${row.entityId}`;
      const entityData = await fetch(`${base}${path}`, {
        headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}` },
      })
        .then((res) => (res.ok ? res.json() : { data: null }))
        .then((body: unknown) =>
          typeof body === 'object' && body !== null && 'data' in body
            ? (body as { data?: unknown }).data ?? null
            : null
        )
        .catch(() => null);
      const branding =
        (await prisma.portalBranding.findUnique({ where: { tenantId: row.tenantId } })) ??
        ({ logoUrl: null, primaryColor: '#3B82F6', companyName: 'Nexus' } as const);
      // Surface the view to the internal CRM timeline (fire-and-forget).
      await emitPortalEngagement(producer, {
        tenantId: row.tenantId,
        entityType: row.entityType,
        entityId: row.entityId,
        action: 'viewed',
        token: row.token,
      });
      return {
        token: row.token,
        entityType: row.entityType,
        entityId: row.entityId,
        entityData,
        branding,
      };
    },

    async recordAction(token: string, action: 'viewed' | 'accepted' | 'rejected' | 'downloaded', tenantId?: string, entityType?: string, entityId?: string, reqCtx: PortalRequestContext = {}) {
      const row = await prisma.portalToken.findUnique({ where: { token } });
      const log = await (prisma as any).portalAuditLog.create({
        data: {
          tenantId: tenantId ?? row?.tenantId ?? 'unknown',
          token,
          entityType: entityType ?? row?.entityType ?? 'UNKNOWN',
          entityId: entityId ?? row?.entityId ?? 'unknown',
          action,
          // Populate the ipAddress/userAgent audit columns (previously unused).
          ipAddress: reqCtx.ipAddress ?? null,
          userAgent: reqCtx.userAgent ?? null,
        },
      });
      // The 'downloaded' action is recorded directly from the download route
      // (accept/reject/viewed emit at their own call sites), so surface it to
      // the internal timeline here to avoid missing that engagement signal.
      if (action === 'downloaded') {
        await emitPortalEngagement(producer, {
          tenantId: tenantId ?? row?.tenantId ?? 'unknown',
          entityType: entityType ?? row?.entityType ?? 'UNKNOWN',
          entityId: entityId ?? row?.entityId ?? 'unknown',
          action: 'downloaded',
          token,
        });
      }
      return log;
    },

    /**
     * Determine whether a token's entity already has a terminal decision by
     * inspecting the existing audit-log history. Fail-open: if the lookup
     * throws, we return null (no known decision) so we never block the action.
     */
    async priorDecision(token: string): Promise<PortalDecision | null> {
      try {
        const last = await (prisma as any).portalAuditLog.findFirst({
          where: { token, action: { in: ['accepted', 'rejected'] } },
          orderBy: { createdAt: 'desc' },
        });
        return (last?.action as PortalDecision | undefined) ?? null;
      } catch {
        return null;
      }
    },

    async accept(token: string, reqCtx: PortalRequestContext = {}) {
      const row = await prisma.portalToken.findUnique({ where: { token } });
      if (!row) return null;
      const prior = await service.priorDecision(token);
      // Guarded transition: only allow accept from a fresh (no-decision) state.
      if (prior && prior !== 'accepted') throw new IllegalPortalTransitionError(prior, 'accepted');
      await service.recordAction(token, 'accepted', row.tenantId, row.entityType, row.entityId, reqCtx);
      await emitPortalEngagement(producer, {
        tenantId: row.tenantId,
        entityType: row.entityType,
        entityId: row.entityId,
        action: 'accepted',
        token,
      });
      // Flip the quote status in finance (authority). Surface failures: do NOT
      // report success to the portal while the status flip silently failed.
      const statusFlipped = await forwardDecisionToFinance(row.entityType, row.entityId, 'accept', row.tenantId, row.token);
      return { accepted: true, statusFlipped };
    },

    async reject(token: string, reason?: string, reqCtx: PortalRequestContext = {}) {
      const row = await prisma.portalToken.findUnique({ where: { token } });
      if (!row) return null;
      const prior = await service.priorDecision(token);
      // Guarded transition: only allow reject from a fresh (no-decision) state.
      if (prior && prior !== 'rejected') throw new IllegalPortalTransitionError(prior, 'rejected');
      await service.recordAction(token, 'rejected', row.tenantId, row.entityType, row.entityId, reqCtx);
      await emitPortalEngagement(producer, {
        tenantId: row.tenantId,
        entityType: row.entityType,
        entityId: row.entityId,
        action: 'rejected',
        token,
        reason,
      });
      const statusFlipped = await forwardDecisionToFinance(row.entityType, row.entityId, 'reject', row.tenantId, row.token, reason);
      return { rejected: true, statusFlipped };
    },

    async getBranding(tenantId: string) {
      return prisma.portalBranding.findUnique({ where: { tenantId } });
    },

    async updateBranding(
      tenantId: string,
      input: { logoUrl?: string | null; primaryColor?: string; companyName?: string | null }
    ) {
      return prisma.portalBranding.upsert({
        where: { tenantId },
        update: input,
        create: { tenantId, ...input },
      });
    },
  };

  return service;
}
