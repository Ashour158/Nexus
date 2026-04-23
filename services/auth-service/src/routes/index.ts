import type { FastifyInstance } from 'fastify';
import type { AuthPrisma } from '../prisma.js';
import { registerApiKeysRoutes } from './api-keys.js';
import { registerAuditLogsRoutes } from './audit-logs.js';
import { registerAuthRoutes } from './auth.js';
import { registerRolesRoutes } from './roles.js';
import { registerTenantsRoutes } from './tenants.js';
import { registerUsersRoutes } from './users.routes.js';

/**
 * Registers all auth-service HTTP routes under `/api/v1` (Section 34.1).
 */
export async function registerAllRoutes(app: FastifyInstance, prisma: AuthPrisma): Promise<void> {
  await registerAuthRoutes(app, prisma);
  await registerUsersRoutes(app, prisma);
  await registerRolesRoutes(app, prisma);
  await registerApiKeysRoutes(app, prisma);
  await registerAuditLogsRoutes(app, prisma);
  await registerTenantsRoutes(app, prisma);
}
