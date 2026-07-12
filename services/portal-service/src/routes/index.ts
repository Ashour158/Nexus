import type { FastifyInstance } from 'fastify';
import type { createPortalService } from '../services/portal.service.js';
import type { createPortalAccountService } from '../services/portal-account.service.js';
import type { createPortalSelfServiceService } from '../services/portal-selfservice.service.js';
import { registerPortalRoutes } from './portal.routes.js';
import { registerPortalAccountRoutes } from './portal-account.routes.js';
import { registerPortalSelfServiceRoutes } from './portal-selfservice.routes.js';

export async function registerRoutes(
  app: FastifyInstance,
  portal: ReturnType<typeof createPortalService>,
  account: ReturnType<typeof createPortalAccountService>,
  selfService: ReturnType<typeof createPortalSelfServiceService>
): Promise<void> {
  await registerPortalRoutes(app, portal);
  await registerPortalAccountRoutes(app, account);
  await registerPortalSelfServiceRoutes(app, selfService);
}
