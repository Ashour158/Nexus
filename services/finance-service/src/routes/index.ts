import type { FastifyInstance } from 'fastify';
import type { NexusProducer } from '@nexus/kafka';
import type { FinancePrisma } from '../prisma.js';
import { registerProductsRoutes } from './products.routes.js';
import { registerInvoicesRoutes } from './invoices.routes.js';
import { registerContractsRoutes } from './contracts.routes.js';
import { registerCpqRoutes } from './cpq.routes.js';
import { registerQuotesRoutes } from './quotes.routes.js';
import { registerCommissionRoutes } from './commission.routes.js';
import { registerCurrencyRoutes } from './currency.routes.js';
import { registerTaxRoutes } from './tax.routes.js';
import { registerVendorRoutes } from './vendor.routes.js';
import { registerKitsRoutes } from './kits.routes.js';
import { registerPriceBookRoutes } from './pricebook.routes.js';
import { registerRFQRoutes } from './rfq.routes.js';
import { registerQuoteTemplateRoutes } from './quote-templates.routes.js';
import { registerQuoteAutomationRoutes } from './automation.routes.js';
import { registerDealRoomsRoutes } from './deal-rooms.routes.js';
import { registerZatcaRoutes } from './zatca.routes.js';
import { registerOrdersRoutes } from './orders.routes.js';
import { registerDiscountRequestRoutes } from './discount-requests.routes.js';
import { registerQuoteDocumentRoutes } from './quote-documents.routes.js';
import { registerCpqTransitionRoutes } from './cpq-transitions.routes.js';
import { registerInternalOperationsRoutes } from './internal-operations.routes.js';
import { registerMoneyTimelineRoutes } from './money-timeline.routes.js';
import { registerInternalPortalRoutes } from './internal-portal.routes.js';
import { registerConfiguratorRoutes } from './configurator.routes.js';
import { registerGuidedSellingRoutes } from './guided-selling.routes.js';

/**
 * Registers every finance HTTP route under `/api/v1`.
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
  await registerDiscountRequestRoutes(app, prisma, producer);
  await registerQuoteDocumentRoutes(app, prisma, producer);
  await registerCpqTransitionRoutes(app, prisma, producer);
  await registerInternalOperationsRoutes(app, prisma, producer);
  await registerOrdersRoutes(app, prisma, producer);
  await registerCommissionRoutes(app, prisma, producer);
  await registerCurrencyRoutes(app, prisma);
  await registerTaxRoutes(app, prisma);
  await registerVendorRoutes(app, prisma);
  await registerKitsRoutes(app, prisma);
  await registerPriceBookRoutes(app, prisma);
  await registerRFQRoutes(app, prisma, producer);
  await registerQuoteTemplateRoutes(app, prisma, producer);
  await registerQuoteAutomationRoutes(app, prisma);
  await registerDealRoomsRoutes(app, prisma);
  await registerZatcaRoutes(app, prisma);
  await registerMoneyTimelineRoutes(app, prisma);
  await registerInternalPortalRoutes(app, prisma, producer);
  await registerConfiguratorRoutes(app, prisma);
  await registerGuidedSellingRoutes(app, prisma);
}
