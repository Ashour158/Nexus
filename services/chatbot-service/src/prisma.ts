import { PrismaClient } from '../../../node_modules/.prisma/chatbot-client/index.js';

export type ChatbotPrisma = PrismaClient;

let prisma: ChatbotPrisma | null = null;

export function getPrisma(): ChatbotPrisma {
  if (!prisma) prisma = new PrismaClient({ log: ['error'] });
  return prisma;
}
