import type { UpsertConnectionInput } from '@nexus/validation';
import type { createFieldCrypto } from '../lib/crypto.js';
import type { IntegrationPrisma } from '../prisma.js';
import { alsStore } from '../request-context.js';

type FieldCrypto = ReturnType<typeof createFieldCrypto>;

function decryptToken(crypto: FieldCrypto, token: string): string {
  try {
    return crypto.decrypt(token);
  } catch {
    return token;
  }
}

function decryptConnectionTokens<T extends { accessToken: string; refreshToken: string | null }>(
  crypto: FieldCrypto,
  connection: T
): T {
  return {
    ...connection,
    accessToken: decryptToken(crypto, connection.accessToken),
    refreshToken: connection.refreshToken ? decryptToken(crypto, connection.refreshToken) : null,
  };
}

export function createConnectionsService(prisma: IntegrationPrisma, crypto: FieldCrypto) {
  return {
    async listConnections() {
      const connections = await prisma.oAuthConnection.findMany({
        orderBy: { provider: 'asc' },
      });
      return connections.map((connection) => decryptConnectionTokens(crypto, connection));
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
        accessToken: crypto.encrypt(input.accessToken),
        refreshToken: input.refreshToken ? crypto.encrypt(input.refreshToken) : null,
        expiresAt,
        scope: input.scopes.join(',') || 'calendar,email',
        email:
          typeof input.metadata?.email === 'string'
            ? (input.metadata.email as string)
            : null,
      };
      if (existing) {
        const updated = await prisma.oAuthConnection.update({
          where: { id: existing.id },
          data: base,
        });
        return decryptConnectionTokens(crypto, updated);
      }
      const created = await prisma.oAuthConnection.create({
        data: {
          tenantId: tid,
          userId: uid,
          provider: input.provider,
          ...base,
        },
      });
      return decryptConnectionTokens(crypto, created);
    },
  };
}
