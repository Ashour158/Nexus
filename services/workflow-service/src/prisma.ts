import { PrismaClient } from '@prisma/client';
import { createPrismaClientWithReplicas } from '@nexus/service-utils/prisma-client';

export type WorkflowPrisma = PrismaClient & { $read: PrismaClient };

export function createWorkflowPrisma(): WorkflowPrisma {
  return createPrismaClientWithReplicas(
    (url: string) =>
      new PrismaClient({
        datasources: {
          db: { url },
        },
      }),
    { connectionLimit: 5, poolTimeout: 10 }
  );
}
