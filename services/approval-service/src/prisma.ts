import { PrismaClient } from '../../../node_modules/.prisma/approval-client/index.js';
import { attachSlowQueryLog, buildDatabaseUrl } from '@nexus/service-utils/db';

export type ApprovalPrisma = PrismaClient;

let prisma: ApprovalPrisma | null = null;

export function getPrisma(): ApprovalPrisma {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.APPROVAL_DATABASE_URL }),
        },
      },
      log: ['error', { emit: 'event', level: 'query' }],
    });
    attachSlowQueryLog(prisma as any, 'approval-service');
  }
  return prisma;
}
