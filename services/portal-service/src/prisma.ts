import { PrismaClient } from '../../../node_modules/.prisma/portal-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';

export type PortalPrisma = PrismaClient;

let prisma: PortalPrisma | null = null;

export function getPrisma(): PortalPrisma {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.PORTAL_DATABASE_URL }),
        },
      },
      log: ['error'],
    });
  }
  return prisma;
}
