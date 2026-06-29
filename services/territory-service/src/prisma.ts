import { PrismaClient } from '../../../node_modules/.prisma/territory-client/index.js';
import { createPrismaClientWithReplicas } from '@nexus/service-utils/prisma-client';

export type TerritoryPrisma = PrismaClient & { $read: PrismaClient };
let prisma: TerritoryPrisma | null = null;

export function getPrisma(): TerritoryPrisma {
  if (!prisma) {
    prisma = createPrismaClientWithReplicas(
      (url: string) =>
        new PrismaClient({
          datasources: {
            db: { url },
          },
          log: ['error'],
        }),
      { connectionLimit: 5, poolTimeout: 10 }
    );
  }
  return prisma;
}
