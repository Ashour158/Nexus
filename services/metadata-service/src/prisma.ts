import { PrismaClient } from '../../../node_modules/.prisma/metadata-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';

export function createMetadataPrisma() {
  return new PrismaClient({
    datasources: {
      db: {
        url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.METADATA_DATABASE_URL }),
      },
    },
  });
}

export type MetadataPrisma = ReturnType<typeof createMetadataPrisma>;
