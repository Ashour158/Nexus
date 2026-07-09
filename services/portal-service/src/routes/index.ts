import type { FastifyInstance } from 'fastify';
import type { createPortalService } from '../services/portal.service.js';
import type { createPortalAccountService } from '../services/portal-account.service.js';
import { registerPortalRoutes } from './portal.routes.js';
import { registerPortalAccountRoutes } from './portal-account.routes.js';

export async function registerRoutes(
  app: FastifyInstance,
  portal: ReturnType<typeof createPortalService>,
  account: ReturnType<typeof createPortalAccountService>
): Promise<void> {
  await registerPortalRoutes(app, portal);
  await registerPortalAccountRoutes(app, account);
}
