import { PrismaClient } from '../../../node_modules/.prisma/cadence-client/index.js';

export type CadencePrisma = PrismaClient;

let prisma: CadencePrisma | null = null;

export function getPrisma(): CadencePrisma {
  if (!prisma) prisma = new PrismaClient({ log: ['error'] });
  return prisma;
}
