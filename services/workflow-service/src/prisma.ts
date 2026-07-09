import { PrismaClient } from '../../../node_modules/.prisma/workflow-client/index.js';
import { createPrismaClientWithReplicas } from '@nexus/service-utils/prisma-client';
import { attachSlowQueryLog } from '@nexus/service-utils/db';

export type WorkflowPrisma = PrismaClient & { $read: PrismaClient };

export function createWorkflowPrisma(): WorkflowPrisma {
  return createPrismaClientWithReplicas(
    (url: string) => {
      const client = new PrismaClient({
        datasources: { db: { url } },
        log: [{ emit: 'event', level: 'query' }],
      });
      attachSlowQueryLog(client as any, 'workflow-service');
      return client;
    },
    { connectionLimit: 5, poolTimeout: 10 }
  );
}
