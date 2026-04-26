import { PrismaClient } from '../../../node_modules/.prisma/reporting-client/index.js';

export type ReportingPrisma = PrismaClient;

let prisma: ReportingPrisma | null = null;

export function getPrisma(): ReportingPrisma {
  if (!prisma) prisma = new PrismaClient({ log: ['error'] });
  return prisma;
}
