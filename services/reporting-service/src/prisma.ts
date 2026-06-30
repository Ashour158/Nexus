import { PrismaClient } from '../../../node_modules/.prisma/reporting-client/index.js';
import { attachSlowQueryLog, buildDatabaseUrl } from '@nexus/service-utils/db';

export type ReportingPrisma = PrismaClient;

let prisma: ReportingPrisma | null = null;

export function getPrisma(): ReportingPrisma {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.REPORTING_DATABASE_URL }),
        },
      },
      log: ['error', { emit: 'event', level: 'query' }],
    });
    attachSlowQueryLog(prisma as any, 'reporting-service');
  }
  return prisma;
}
