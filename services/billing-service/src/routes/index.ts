import type { FastifyInstance } from 'fastify';
import type { NexusProducer } from '@nexus/kafka';
import type { EntitlementResolver } from '@nexus/service-utils';
import type { BillingPrisma } from '../prisma.js';
import { registerPlansRoutes } from './plans.routes.js';
import { registerSubscriptionsRoutes } from './subscriptions.routes.js';
import { registerInvoicesRoutes } from './invoices.routes.js';
import { registerPaymentsRoutes } from './payments.routes.js';
import { registerWebhooksRoutes } from './webhooks.routes.js';
import { registerUsageRoutes } from './usage.routes.js';
import { registerCreditNotesRoutes } from './creditnotes.routes.js';
import { registerInternalRoutes } from './internal.routes.js';

export async function registerAllBillingRoutes(
  app: FastifyInstance,
  prisma: BillingPrisma,
  producer: NexusProducer,
  entitlementResolver: EntitlementResolver
): Promise<void> {
  await registerPlansRoutes(app, prisma);
  await registerSubscriptionsRoutes(app, prisma, producer);
  await registerInvoicesRoutes(app, prisma);
  await registerPaymentsRoutes(app, prisma, producer);
  await registerWebhooksRoutes(app, prisma, producer);
  await registerUsageRoutes(app, prisma, entitlementResolver);
  await registerCreditNotesRoutes(app, prisma, producer, entitlementResolver);
  await registerInternalRoutes(app, prisma);
}
