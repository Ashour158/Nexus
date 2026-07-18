import type { FastifyInstance } from 'fastify';
import type { createKnowledgeService } from '../services/knowledge.service.js';
import type { KnowledgePrisma } from '../prisma.js';
import { registerKnowledgeRoutes } from './knowledge.routes.js';
import { registerInternalSearchSourceRoutes } from './internal-search-source.routes.js';

export async function registerRoutes(
  app: FastifyInstance,
  knowledge: ReturnType<typeof createKnowledgeService>,
  prisma: KnowledgePrisma
): Promise<void> {
  await registerKnowledgeRoutes(app, knowledge);
  await registerInternalSearchSourceRoutes(app, prisma);
}
