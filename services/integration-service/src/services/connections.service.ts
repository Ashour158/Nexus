import type { UpsertConnectionInput } from '@nexus/validation';
import type { IntegrationPrisma } from '../prisma.js';
import { alsStore } from '../request-context.js';

export function createConnectionsService(prisma: IntegrationPrisma) {
  return {
    async listConnections() {
      return prisma.oAuthConnection.findMany({
        orderBy: { provider: 'asc' },
      });
    },

    async upsertConnection(input: UpsertConnectionInput) {
      const existing = await prisma.oAuthConnection.findFirst({
        where: {
          provider: input.provider,
          scope: input.scopes.join(',') || 'calendar,email',
        },
      });
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      const tid = alsStore.get('tenantId') as string;
      const uid = alsStore.get('userId') as string;
      const base: {
        accessToken: string;
        refreshToken: string | null;
        expiresAt: Date | null;
        scope: string;
        email: string | null;
      } = {
        accessToken: input.accessToken,
        refreshToken: input.refreshToken ?? null,
        expiresAt,
        scope: input.scopes.join(',') || 'calendar,email',
        email:
          typeof input.metadata?.email === 'string'
            ? (input.metadata.email as string)
            : null,
      };
      if (existing) {
        return prisma.oAuthConnection.update({
          where: { id: existing.id },
          data: base,
        });
      }
      return prisma.oAuthConnection.create({
        data: {
          tenantId: tid,
          userId: uid,
          provider: input.provider,
          ...base,
        },
      });
    },
  };
}
