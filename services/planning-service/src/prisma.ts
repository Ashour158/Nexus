import { PrismaClient } from '../../../node_modules/.prisma/planning-client/index.js';
import { attachSlowQueryLog, buildDatabaseUrl } from '@nexus/service-utils/db';

export type PlanningPrisma = PrismaClient;

let prisma: PlanningPrisma | null = null;

export function getPrisma(): PlanningPrisma {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.PLANNING_DATABASE_URL }),
        },
      },
      log: ['error', { emit: 'event', level: 'query' }],
    });
    attachSlowQueryLog(prisma as any, 'planning-service');
  }
  return prisma;
}
