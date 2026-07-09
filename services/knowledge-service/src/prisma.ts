import { PrismaClient } from '../../../node_modules/.prisma/knowledge-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';

export type KnowledgePrisma = PrismaClient;

let prisma: KnowledgePrisma | null = null;

export function getPrisma(): KnowledgePrisma {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.KNOWLEDGE_DATABASE_URL }),
        },
      },
      log: ['error'],
    });
  }
  return prisma;
}
