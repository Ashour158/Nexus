import { PrismaClient } from '../../../node_modules/.prisma/planning-client/index.js';

export type PlanningPrisma = PrismaClient;

let prisma: PlanningPrisma | null = null;

export function getPrisma(): PlanningPrisma {
  if (!prisma) prisma = new PrismaClient({ log: ['error'] });
  return prisma;
}
