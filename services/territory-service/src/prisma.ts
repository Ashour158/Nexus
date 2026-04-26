import { PrismaClient } from '../../../node_modules/.prisma/territory-client/index.js';

export type TerritoryPrisma = PrismaClient;
let prisma: TerritoryPrisma | null = null;

export function getPrisma(): TerritoryPrisma {
  if (!prisma) prisma = new PrismaClient({ log: ['error'] });
  return prisma;
}
