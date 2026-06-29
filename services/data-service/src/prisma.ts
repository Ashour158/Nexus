import { PrismaClient } from '../../../node_modules/.prisma/data-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';

export type DataPrisma = PrismaClient;

let prisma: DataPrisma | null = null;

export function getPrisma(): DataPrisma {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.DATA_DATABASE_URL }),
        },
      },
      log: ['error'],
    });
  }
  return prisma;
}
