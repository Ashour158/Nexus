import { PrismaClient } from '../../../node_modules/.prisma/storage-client/index.js';

export type StoragePrisma = PrismaClient;

export function createStoragePrisma(): StoragePrisma {
  return new PrismaClient();
}
