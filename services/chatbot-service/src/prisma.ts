import { PrismaClient } from '../../../node_modules/.prisma/chatbot-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';

export type ChatbotPrisma = PrismaClient;

let prisma: ChatbotPrisma | null = null;

export function getPrisma(): ChatbotPrisma {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.CHATBOT_DATABASE_URL }),
        },
      },
      log: ['error'],
    });
  }
  return prisma;
}
