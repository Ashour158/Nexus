import { PrismaClient } from '../../../node_modules/.prisma/activities-client/index.js';
import { attachSlowQueryLog, buildDatabaseUrl } from '@nexus/service-utils/db';

export function createActivitiesPrisma() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.ACTIVITIES_DATABASE_URL }),
      },
    },
    log: [{ emit: 'event', level: 'query' }],
  });
  attachSlowQueryLog(prisma as any, 'activities-service');
  return prisma;
}

export type ActivitiesPrisma = ReturnType<typeof createActivitiesPrisma>;
