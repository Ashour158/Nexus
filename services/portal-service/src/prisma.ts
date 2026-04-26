import { PrismaClient } from '../../../node_modules/.prisma/portal-client/index.js';

export type PortalPrisma = PrismaClient;

let prisma: PortalPrisma | null = null;

export function getPrisma(): PortalPrisma {
  if (!prisma) prisma = new PrismaClient({ log: ['error'] });
  return prisma;
}
