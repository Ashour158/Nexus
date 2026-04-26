import { PrismaClient } from '../../../node_modules/.prisma/comm-client/index.js';

export type CommPrisma = PrismaClient;

export function createCommPrisma(): CommPrisma {
  return new PrismaClient();
}
