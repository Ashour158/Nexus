import { PrismaClient } from '../../../node_modules/.prisma/incentive-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';

export type IncentivePrisma = PrismaClient;

let prisma: IncentivePrisma | null = null;

export function getPrisma(): IncentivePrisma {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: buildDatabaseUrl({ connectionLimit: 5, poolTimeout: 10, databaseUrl: process.env.INCENTIVE_DATABASE_URL }),
        },
      },
      log: ['error'],
    });
  }
  return prisma;
}
