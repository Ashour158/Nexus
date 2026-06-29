import { PrismaClient } from '../../../node_modules/.prisma/contacts-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';

export function createContactsPrisma() {
  return new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.CONTACTS_DATABASE_URL }),
      },
    },
  });
}

export type ContactsPrisma = ReturnType<typeof createContactsPrisma>;
