import { PrismaClient } from '../../../node_modules/.prisma/ticket-client/index.js';
import { createPrismaClientWithReplicas } from '@nexus/service-utils/prisma-client';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { AsyncLocalStorage } from 'node:async_hooks';

export const tenantAls = new AsyncLocalStorage<{ tenantId: string }>();

export type TicketPrisma = PrismaClient & { $read: PrismaClient };
let prisma: TicketPrisma | null = null;
let rawPrisma: (PrismaClient & { $read: PrismaClient }) | null = null;

export function getPrisma(): TicketPrisma {
  if (!prisma) {
    const base = createPrismaClientWithReplicas(
      (url: string) =>
        new PrismaClient({
          datasources: {
            db: { url },
          },
          log: ['error'],
        }),
      { connectionLimit: 5, poolTimeout: 10, writeUrl: process.env.TICKET_DATABASE_URL }
    );
    rawPrisma = base;
    prisma = base.$extends(
      createTenantPrismaExtension(base as any, {
        getTenantId: () => tenantAls.getStore()?.tenantId,
        // Global / cross-tenant tables the SLA poller scans without a tenant ctx.
        skipModels: new Set(['OutboxMessage']),
      })
    ) as unknown as TicketPrisma;
  }
  return prisma;
}

/**
 * The RAW (non-tenant-extended) client. Background sweeps like the SLA breach
 * poller run with NO tenant in AsyncLocalStorage; using the extended client
 * there would fail-closed (TenantContextError). The poller instead reads/writes
 * on this client and pins every query with an explicit `tenantId` from the row.
 */
export function getRawPrisma(): PrismaClient & { $read: PrismaClient } {
  if (!rawPrisma) getPrisma();
  return rawPrisma!;
}
