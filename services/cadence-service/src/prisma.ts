import { PrismaClient } from '../../../node_modules/.prisma/cadence-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';

export type CadencePrisma = PrismaClient;

let prisma: CadencePrisma | null = null;

export function getPrisma(): CadencePrisma {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.CADENCE_DATABASE_URL }),
        },
      },
      log: ['error'],
    });
  }
  return prisma;
}
