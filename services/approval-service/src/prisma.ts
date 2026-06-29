import { PrismaClient } from '../../../node_modules/.prisma/approval-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';

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
      log: ['error'],
    });
  }
  return prisma;
}
