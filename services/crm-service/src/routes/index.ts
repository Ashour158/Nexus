import type { FastifyInstance } from 'fastify';
import type { NexusProducer } from '@nexus/kafka';
import type { CrmPrisma } from '../prisma.js';
import { registerDealsRoutes } from './deals.routes.js';
import { registerAccountsRoutes } from './accounts.routes.js';
import { registerContactsRoutes } from './contacts.routes.js';
import { registerLeadsRoutes } from './leads.routes.js';
import { registerPipelinesRoutes } from './pipelines.routes.js';

/**
 * Registers every CRM HTTP route under `/api/v1` — Section 34.2.
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
}
