import type { FastifyInstance } from 'fastify';
import type { createPortalService } from '../services/portal.service.js';
import { registerPortalRoutes } from './portal.routes.js';

export async function registerRoutes(
  app: FastifyInstance,
  portal: ReturnType<typeof createPortalService>
): Promise<void> {
  await registerPortalRoutes(app, portal);
}
