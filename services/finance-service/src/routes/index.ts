import type { FastifyInstance } from 'fastify';
import type { NexusProducer } from '@nexus/kafka';
import type { FinancePrisma } from '../prisma.js';
import { registerProductsRoutes } from './products.routes.js';
import { registerInvoicesRoutes } from './invoices.routes.js';
import { registerContractsRoutes } from './contracts.routes.js';
import { registerCpqRoutes } from './cpq.routes.js';
import { registerQuotesRoutes } from './quotes.routes.js';
import { registerCommissionRoutes } from './commission.routes.js';

/**
 * Registers every finance HTTP route under `/api/v1` — Section 34.3 + 40 + 41.
 */
export async function registerAllRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma,
  producer: NexusProducer
): Promise<void> {
  await registerProductsRoutes(app, prisma);
  await registerInvoicesRoutes(app, prisma, producer);
  await registerContractsRoutes(app, prisma);
  await registerCpqRoutes(app, prisma);
  await registerQuotesRoutes(app, prisma, producer);
  await registerCommissionRoutes(app, prisma, producer);
}
