import type { FastifyInstance } from 'fastify';
import type { NexusProducer } from '@nexus/kafka';
import type { WorkflowPrisma } from '../prisma.js';
import { registerWorkflowsRoutes } from './workflows.routes.js';
import { registerExecutionsRoutes } from './executions.routes.js';
import { registerJourneysRoutes } from './journeys.routes.js';
import { registerCommandJourneysRoutes } from './command-journeys.routes.js';
import { registerSlaRoutes } from './sla.routes.js';
import { registerAutomationRulesRoutes } from './automation-rules.routes.js';

export async function registerRoutes(
  app: FastifyInstance,
  prisma: WorkflowPrisma,
  producer: NexusProducer
): Promise<void> {
  await registerWorkflowsRoutes(app, prisma, producer);
  await registerExecutionsRoutes(app, prisma, producer);
  await registerJourneysRoutes(app, prisma);
  await registerCommandJourneysRoutes(app, prisma, producer);
  await registerSlaRoutes(app, prisma);
  await registerAutomationRulesRoutes(app, prisma);
}
