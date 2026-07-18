import type { JwksKeyStore } from '../lib/jwt.js';
import type { AuthPrisma } from '../prisma.js';
import { createLoaders, type GraphQLLoaders } from './loaders.js';

export interface GraphQLContext {
  prisma: AuthPrisma;
  keyStore: JwksKeyStore;
  tenantId: string | null;
  userId: string | null;
  loaders: GraphQLLoaders;
}

export function buildContext(prisma: AuthPrisma, keyStore: JwksKeyStore) {
  return async function createContext({ request }: { request: Request }): Promise<GraphQLContext> {
    const authHeader = request.headers.get('authorization');
    let tenantId: string | null = null;
    let userId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const verified = await keyStore.verify(token);
        tenantId = (verified as { tenantId?: string }).tenantId ?? null;
        userId = (verified as { sub?: string }).sub ?? null;
      } catch {
        // ignore invalid/malformed/expired token
      }
    }

    return { prisma, keyStore, tenantId, userId, loaders: createLoaders(prisma) };
  };
}
