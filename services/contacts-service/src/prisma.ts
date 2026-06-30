import { PrismaClient } from '../../../node_modules/.prisma/contacts-client/index.js';
import { attachSlowQueryLog, buildDatabaseUrl } from '@nexus/service-utils/db';

export function createContactsPrisma() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.CONTACTS_DATABASE_URL }),
      },
    },
    log: [{ emit: 'event', level: 'query' }],
  });
  attachSlowQueryLog(prisma as any, 'contacts-service');
  return prisma;
}

export type ContactsPrisma = ReturnType<typeof createContactsPrisma>;
