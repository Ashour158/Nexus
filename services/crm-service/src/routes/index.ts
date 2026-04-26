import type { FastifyInstance } from 'fastify';
import type { NexusProducer } from '@nexus/kafka';
import type { CrmPrisma } from '../prisma.js';
import { registerDealsRoutes } from './deals.routes.js';
import { registerAccountsRoutes } from './accounts.routes.js';
import { registerContactsRoutes } from './contacts.routes.js';
import { registerLeadsRoutes } from './leads.routes.js';
import { registerPipelinesRoutes } from './pipelines.routes.js';
import { registerActivitiesRoutes } from './activities.routes.js';
import { registerNotesRoutes } from './notes.routes.js';
import { registerEmailThreadsRoutes } from './email-threads.routes.js';
import { registerCrmReportsRoutes } from './reports.routes.js';

/**
 * Registers every CRM HTTP route under `/api/v1` — Section 34.2 + 34.3.
 */
export async function registerAllRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  await registerAccountsRoutes(app, prisma, producer);
  await registerContactsRoutes(app, prisma, producer);
  await registerLeadsRoutes(app, prisma, producer);
  await registerPipelinesRoutes(app, prisma);
  await registerDealsRoutes(app, prisma, producer);
  await registerActivitiesRoutes(app, prisma, producer);
  await registerNotesRoutes(app, prisma);
  await registerEmailThreadsRoutes(app, prisma);
  await registerCrmReportsRoutes(app, prisma);
}
