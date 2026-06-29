import { PrismaClient } from '../../../node_modules/.prisma/activities-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';

export function createActivitiesPrisma() {
  return new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.ACTIVITIES_DATABASE_URL }),
      },
    },
  });
}

export type ActivitiesPrisma = ReturnType<typeof createActivitiesPrisma>;
