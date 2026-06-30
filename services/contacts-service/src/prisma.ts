import { PrismaClient } from '../../../node_modules/.prisma/contacts-client/index.js';
import { attachSlowQueryLog, buildDatabaseUrl } from '@nexus/service-utils/db';
import { withFieldEncryption } from '@nexus/security';

export function createContactsPrisma() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.CONTACTS_DATABASE_URL }),
      },
    },
    log: [{ emit: 'event', level: 'query' }],
  });
  const encryptionKey = process.env.ENCRYPTION_MASTER_KEY;
  if (encryptionKey && encryptionKey.length >= 32) {
    withFieldEncryption(prisma, encryptionKey, [
      { model: 'Contact', fields: ['email', 'phone'] },
    ]);
  }
  attachSlowQueryLog(prisma as any, 'contacts-service');
  return prisma;
}

export type ContactsPrisma = ReturnType<typeof createContactsPrisma>;
