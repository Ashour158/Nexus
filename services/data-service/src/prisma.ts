import { PrismaClient } from '../../../node_modules/.prisma/data-client/index.js';

export type DataPrisma = PrismaClient;

let prisma: DataPrisma | null = null;

export function getPrisma(): DataPrisma {
  if (!prisma) {
    prisma = new PrismaClient({ log: ['error'] });
  }
  return prisma;
}
