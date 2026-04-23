import { PrismaClient } from '@prisma/client';

export type WorkflowPrisma = any;

export function createWorkflowPrisma(): WorkflowPrisma {
  return new (PrismaClient as any)();
}
