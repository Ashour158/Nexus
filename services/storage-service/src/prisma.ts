import { PrismaClient } from '../../../node_modules/.prisma/storage-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';

export type StoragePrisma = PrismaClient;

export function createStoragePrisma(): StoragePrisma {
  return new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.STORAGE_DATABASE_URL }),
      },
    },
  });
}
