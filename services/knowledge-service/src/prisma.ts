import { PrismaClient } from '../../../node_modules/.prisma/knowledge-client/index.js';

export type KnowledgePrisma = PrismaClient;

let prisma: KnowledgePrisma | null = null;

export function getPrisma(): KnowledgePrisma {
  if (!prisma) prisma = new PrismaClient({ log: ['error'] });
  return prisma;
}
