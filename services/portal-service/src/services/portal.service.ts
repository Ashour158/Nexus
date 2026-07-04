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

    async getPortalContext(token: string) {
      const row = await prisma.portalToken.findUnique({ where: { token } });
      if (!row || row.expiresAt < new Date()) return null;
      await prisma.portalToken.update({
        where: { id: row.id },
        data: { viewCount: { increment: 1 } },
      });
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

    async recordAction(token: string, action: 'viewed' | 'accepted' | 'rejected' | 'downloaded', tenantId?: string, entityType?: string, entityId?: string) {
      const row = await prisma.portalToken.findUnique({ where: { token } });
      const log = await (prisma as any).portalAuditLog.create({
        data: {
          tenantId: tenantId ?? row?.tenantId ?? 'unknown',
          token,
          entityType: entityType ?? row?.entityType ?? 'UNKNOWN',
          entityId: entityId ?? row?.entityId ?? 'unknown',
          action,
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

    async accept(token: string) {
      const row = await prisma.portalToken.findUnique({ where: { token } });
      if (!row) return null;
      const prior = await service.priorDecision(token);
      // Guarded transition: only allow accept from a fresh (no-decision) state.
      if (prior && prior !== 'accepted') throw new IllegalPortalTransitionError(prior, 'accepted');
      await service.recordAction(token, 'accepted', row.tenantId, row.entityType, row.entityId);
      await emitPortalEngagement(producer, {
        tenantId: row.tenantId,
        entityType: row.entityType,
        entityId: row.entityId,
        action: 'accepted',
        token,
      });
      await fetch(`${serviceFor(row.entityType)}/api/v1/quotes/${row.entityId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}` },
      }).catch(() => undefined);
      return { accepted: true };
    },

    async reject(token: string, reason?: string) {
      const row = await prisma.portalToken.findUnique({ where: { token } });
      if (!row) return null;
      const prior = await service.priorDecision(token);
      // Guarded transition: only allow reject from a fresh (no-decision) state.
      if (prior && prior !== 'rejected') throw new IllegalPortalTransitionError(prior, 'rejected');
      await service.recordAction(token, 'rejected', row.tenantId, row.entityType, row.entityId);
      await emitPortalEngagement(producer, {
        tenantId: row.tenantId,
        entityType: row.entityType,
        entityId: row.entityId,
        action: 'rejected',
        token,
        reason,
      });
      await fetch(`${serviceFor(row.entityType)}/api/v1/quotes/${row.entityId}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      }).catch(() => undefined);
      return { rejected: true };
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
