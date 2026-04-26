import type { PortalPrisma } from '../prisma.js';

type EntityType = 'QUOTE' | 'CONTRACT' | 'INVOICE' | 'ACCOUNT';

function serviceFor(entityType: EntityType): string {
  if (entityType === 'ACCOUNT') return process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
  return process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3003';
}

export function createPortalService(prisma: PortalPrisma) {
  return {
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
      return {
        token: row.token,
        entityType: row.entityType,
        entityId: row.entityId,
        entityData,
        branding,
      };
    },

    async recordAction(token: string, action: 'viewed' | 'accepted' | 'rejected' | 'downloaded') {
      return { token, action, recordedAt: new Date().toISOString() };
    },

    async accept(token: string) {
      const row = await prisma.portalToken.findUnique({ where: { token } });
      if (!row) return null;
      await this.recordAction(token, 'accepted');
      await fetch(`${serviceFor(row.entityType)}/api/v1/quotes/${row.entityId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}` },
      }).catch(() => undefined);
      return { accepted: true };
    },

    async reject(token: string, reason?: string) {
      const row = await prisma.portalToken.findUnique({ where: { token } });
      if (!row) return null;
      await this.recordAction(token, 'rejected');
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
}
