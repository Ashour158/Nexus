import type { FastifyInstance } from 'fastify';
import type { NexusProducer } from '@nexus/kafka';
import type { CrmPrisma } from '../prisma.js';
import { registerDealsRoutes } from './deals.routes.js';
import { registerDealLineItemsRoutes } from './deal-line-items.routes.js';
import { registerAccountHierarchyRoutes } from './account-hierarchy.routes.js';
import { registerAccountContactRelationsRoutes } from './account-contact-relations.routes.js';
import { registerStakeholderRoutes } from './stakeholders.routes.js';
import { registerDealRoomRoutes } from './deal-room.routes.js';
import { registerAccountsRoutes } from './accounts.routes.js';
import { registerContactsRoutes } from './contacts.routes.js';
import { registerLeadsRoutes } from './leads.routes.js';
import { registerPipelinesRoutes } from './pipelines.routes.js';
import { registerActivitiesRoutes } from './activities.routes.js';
import { registerNotesRoutes } from './notes.routes.js';
import { registerEmailThreadsRoutes } from './email-threads.routes.js';
import { registerCrmReportsRoutes } from './reports.routes.js';
import { registerBulkRoutes } from './bulk.routes.js';
import { registerDedupRoutes } from './dedup.routes.js';
import { createDedupService } from '../services/dedup.service.js';
import { registerScoringRoutes } from './scoring.routes.js';
import { registerForecastRoutes } from './forecast.routes.js';
import { registerEnrichmentRoutes } from './enrichment.routes.js';
import { registerCustomFieldsRoutes } from './custom-fields.routes.js';
import { registerInternalReportingRoutes } from './internal-reporting.routes.js';
import { registerCrmInternalRoutes } from './internal.routes.js';
import { registerWinLossRoutes } from './win-loss.routes.js';
import { registerFieldHistoryRoutes } from './field-history.routes.js';
import { registerValidationRulesRoutes } from './validation-rules.routes.js';
import { registerConsentRoutes } from './consent.routes.js';
import { registerCompaniesRoutes } from './companies.routes.js';
import { registerMeetingsRoutes } from './meetings.routes.js';
import { registerTasksRoutes } from './tasks.routes.js';
import { registerFollowersRoutes } from './followers.routes.js';
import { registerSavedViewsRoutes } from './saved-views.routes.js';
import { registerDataQualityRoutes } from './data-quality.routes.js';

/**
 * Registers every CRM HTTP route under `/api/v1` — Section 34.2 + 34.3.
 */
export async function registerAllRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const dedupService = createDedupService(prisma, producer);
  await registerAccountHierarchyRoutes(app, prisma);
  await registerAccountContactRelationsRoutes(app, prisma);
  await registerStakeholderRoutes(app, prisma);
  await registerDealRoomRoutes(app, prisma);
  await registerDealsRoutes(app, prisma, producer);
  await registerDealLineItemsRoutes(app, prisma, producer);
  await registerAccountsRoutes(app, prisma, producer);
  await registerContactsRoutes(app, prisma, producer);
  await registerLeadsRoutes(app, prisma, producer);
  await registerPipelinesRoutes(app, prisma);
  await registerActivitiesRoutes(app, prisma, producer);
  await registerNotesRoutes(app, prisma);
  await registerCustomFieldsRoutes(app, prisma);
  await registerEmailThreadsRoutes(app, prisma);
  await registerCrmReportsRoutes(app, prisma);
  await registerBulkRoutes(app, prisma, producer);
  await registerDedupRoutes(app, prisma, dedupService);
  await registerScoringRoutes(app, prisma);
  await registerForecastRoutes(app, prisma);
  await registerEnrichmentRoutes(app, prisma, producer);
  await registerInternalReportingRoutes(app, prisma);
  await registerCrmInternalRoutes(app, prisma, producer);
  await registerWinLossRoutes(app, prisma);
  await registerFieldHistoryRoutes(app, prisma);
  await registerValidationRulesRoutes(app, prisma);
  await registerConsentRoutes(app, prisma);
  await registerCompaniesRoutes(app, prisma);
  await registerMeetingsRoutes(app, prisma);
  await registerTasksRoutes(app, prisma);
  await registerFollowersRoutes(app, prisma);
  await registerSavedViewsRoutes(app, prisma);
  await registerDataQualityRoutes(app, prisma);
}
