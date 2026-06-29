import type { FastifyInstance } from 'fastify';
import { registerDocumentsRoutes } from './documents.routes.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await registerDocumentsRoutes(app);
}
