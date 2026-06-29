import { PrismaClient } from '../../../node_modules/.prisma/crm-client/index.js';
import { createPrismaClientWithReplicas } from '@nexus/service-utils/prisma-client';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { withFieldEncryption } from '@nexus/security';
import { alsStore } from './request-context.js';
import { OutboxPublisher } from '@nexus/outbox';
import { TOPICS } from '@nexus/kafka';

const skipTenantModels = new Set<string>();

const softDeleteModels = new Set([
  'Lead', 'Contact', 'Deal', 'Account', 'Activity', 'Note', 'Quote',
  'Pipeline', 'Stage', 'EmailThread', 'Competitor', 'Territory', 'SalesRep',
  'EnrichmentJob', 'LeadScore', 'AccountHealthScore', 'LeadScoringRule',
  'CustomFieldDefinition', 'Attachment', 'WinLossReason', 'FieldPermission',
  'ValidationRule', 'DuplicateGroup', 'ConsentRecord', 'DealRoom',
  'DealCompetitor', 'LeadRoutingEvent', 'DealRoomDocument', 'MutualActionItem',
]);

const readOperations = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate', 'groupBy',
]);

function applySoftDeleteFilter(model: string, args: unknown): unknown {
  if (!softDeleteModels.has(model)) return args;
  const a = (args || {}) as Record<string, unknown>;
  const where = (a.where || {}) as Record<string, unknown>;
  if (where.deletedAt === undefined) {
    where.deletedAt = null;
  }
  return { ...a, where };
}

/* ─── Event publishing mapping ────────────────────────────────────────────── */

const MODEL_TOPIC_MAP: Record<string, string> = {
  Contact: TOPICS.CONTACTS,
  Deal: TOPICS.DEALS,
  Account: TOPICS.ACCOUNTS,
  Activity: TOPICS.ACTIVITIES,
  Pipeline: TOPICS.DEALS,
  Stage: TOPICS.DEALS,
  Note: TOPICS.CONTACTS,
  CustomFieldDefinition: 'nexus.crm.custom-fields',
};

function getEventType(model: string, operation: string): string | null {
  const base = model.toLowerCase().replace(/definition$/, '');
  switch (operation) {
    case 'create':
      return `${base}.created`;
    case 'update':
      return `${base}.updated`;
    case 'upsert':
      return `${base}.updated`;
    case 'delete':
      return `${base}.deleted`;
    default:
      return null;
  }
}

async function publishMutationEvent(
  prisma: any,
  outbox: OutboxPublisher,
  model: string,
  operation: string,
  result: unknown
) {
  const topic = MODEL_TOPIC_MAP[model];
  if (!topic) return;
  const eventType = getEventType(model, operation);
  if (!eventType) return;

  const record = result as Record<string, unknown> | null;
  if (!record) return;

  const tenantId = record.tenantId as string | undefined;
  if (!tenantId) return;

  const isDelete = operation === 'delete';
  const payload = isDelete
    ? { id: record.id, action: 'DELETED' as const, source: 'crm-service' }
    : { ...record, source: 'crm-service' };

  try {
    // Best-effort outbox write. Full transactional safety requires wrapping
    // the mutation + outbox.schedule in an explicit $transaction at the service layer.
    await outbox.publish(
      prisma,
      topic,
      payload,
      { eventType, tenantId, aggregateId: record.id as string | undefined }
    );
  } catch (err) {
    const requestId = alsStore.get('requestId') as string | undefined;
    console.error(`Failed to outbox ${eventType} event:`, err, { requestId, payload });
  }
}

export function createCrmPrisma() {
  const outbox = new OutboxPublisher('crm-service');

  const base = createPrismaClientWithReplicas(
    (url: string) =>
      new PrismaClient({
        datasources: {
          db: { url },
        },
      }),
    { connectionLimit: 3, poolTimeout: 10, writeUrl: process.env.CRM_DATABASE_URL }
  );

  // Wire field-level encryption for PII fields (GDPR Art. 32 compliance)
  const encryptionKey = process.env.ENCRYPTION_MASTER_KEY;
  if (encryptionKey && encryptionKey.length >= 32) {
    withFieldEncryption(base as any, encryptionKey, [
      { model: 'Contact', fields: ['email', 'phone', 'mobile', 'address'] },
      { model: 'Account', fields: ['billingAddressLine1', 'billingAddressLine2', 'shippingAddressLine1', 'shippingAddressLine2'] },
      { model: 'Note', fields: ['content'] },
      { model: 'Lead', fields: ['email', 'phone', 'address'] },
    ]);
  }

  const tenantExt = createTenantPrismaExtension(base, {
    getTenantId: () => alsStore.get('tenantId') as string | undefined,
    skipModels: skipTenantModels,
  });

  const softDeleteExt = {
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string;
          operation: string;
          args: unknown;
          query: (a: unknown) => Promise<unknown>;
        }) {
          if (readOperations.has(operation)) {
            args = applySoftDeleteFilter(model, args);
          }
          return query(args);
        },
      },
    },
  };

  return base.$extends(tenantExt).$extends(softDeleteExt).$extends({
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string;
          operation: string;
          args: unknown;
          query: (a: unknown) => Promise<unknown>;
        }) {
          const result = await query(args);
          if (['create', 'update', 'delete', 'upsert'].includes(operation)) {
            await publishMutationEvent(base, outbox, model, operation, result);
          }
          return result;
        },
      },
    },
  });
}

export type CrmPrisma = ReturnType<typeof createCrmPrisma>;
