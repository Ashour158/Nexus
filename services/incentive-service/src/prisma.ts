import { PrismaClient } from '../../../node_modules/.prisma/incentive-client/index.js';

export type IncentivePrisma = PrismaClient;

let prisma: IncentivePrisma | null = null;

export function getPrisma(): IncentivePrisma {
  if (!prisma) prisma = new PrismaClient({ log: ['error'] });
  return prisma;
}
