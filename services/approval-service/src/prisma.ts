import { PrismaClient } from '../../../node_modules/.prisma/approval-client/index.js';

export type ApprovalPrisma = PrismaClient;

let prisma: ApprovalPrisma | null = null;

export function getPrisma(): ApprovalPrisma {
  if (!prisma) prisma = new PrismaClient({ log: ['error'] });
  return prisma;
}
