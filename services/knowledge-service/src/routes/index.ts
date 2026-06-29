import type { FastifyInstance } from 'fastify';
import type { createKnowledgeService } from '../services/knowledge.service.js';
import { registerKnowledgeRoutes } from './knowledge.routes.js';

export async function registerRoutes(
  app: FastifyInstance,
  knowledge: ReturnType<typeof createKnowledgeService>
): Promise<void> {
  await registerKnowledgeRoutes(app, knowledge);
}
