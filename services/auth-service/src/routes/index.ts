import type { FastifyInstance } from 'fastify';
import type { NexusProducer } from '@nexus/kafka';
import type { AuthPrisma } from '../prisma.js';
import type { JwksKeyStore } from '../lib/jwt.js';
import type { UnifiedAuditLogger } from '../lib/unified-audit.js';
import { registerApiKeysRoutes } from './api-keys.js';
import { registerAuditLogsRoutes } from './audit-logs.js';
import { registerAuthRoutes } from './auth.js';
import { registerDataOwnershipRoutes } from './data-ownership.routes.js';
import { registerProfileRoutes } from './profile.routes.js';
import { registerRolesRoutes } from './roles.js';
import { registerTenantsRoutes } from './tenants.js';
import { registerUsersRoutes } from './users.routes.js';
import { registerSsoRoutes } from './sso.routes.js';
import { registerGdprRoutes } from './gdpr.routes.js';
import { registerPermissionsRoutes } from './permissions.routes.js';
import { registerMfaRoutes } from './mfa.routes.js';
import { registerIpRestrictionRoutes } from './ip-restriction.routes.js';
import { registerInternalRoutes } from './internal.routes.js';
import { registerCompanyRoutes } from './company.routes.js';
import { registerDepartmentsRoutes } from './departments.routes.js';
import { registerLevelsRoutes } from './levels.routes.js';
import { registerOrgRoutes } from './org.routes.js';

/**
 * Registers all auth-service HTTP routes under `/api/v1` (Section 34.1).
 */
export async function registerAllRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma,
  producer: NexusProducer,
  keyStore: JwksKeyStore,
  unifiedAudit: UnifiedAuditLogger
): Promise<void> {
  await registerAuthRoutes(app, prisma, keyStore, producer, unifiedAudit);
  await registerMfaRoutes(app, prisma, keyStore);
  await registerUsersRoutes(app, prisma, unifiedAudit);
  await registerRolesRoutes(app, prisma, unifiedAudit);
  await registerApiKeysRoutes(app, prisma, unifiedAudit);
  await registerAuditLogsRoutes(app, prisma);
  await registerTenantsRoutes(app, prisma);
  await registerSsoRoutes(app, prisma);
  await registerGdprRoutes(app, prisma, producer);
  await registerDataOwnershipRoutes(app, prisma, producer);
  await registerProfileRoutes(app, prisma);
  await registerPermissionsRoutes(app, prisma);
  await registerIpRestrictionRoutes(app, prisma, unifiedAudit);
  await registerInternalRoutes(app, prisma);
  await registerCompanyRoutes(app, prisma);
  await registerDepartmentsRoutes(app, prisma);
  await registerLevelsRoutes(app, prisma);
  await registerOrgRoutes(app, prisma);
}
