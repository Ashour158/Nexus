import { PrismaClient } from '../../../node_modules/.prisma/comm-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';

export type CommPrisma = PrismaClient;

export function createCommPrisma(): CommPrisma {
  return new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.COMM_DATABASE_URL }),
      },
    },
  });
}
