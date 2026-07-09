import { PrismaClient } from '../../../node_modules/.prisma/notes-client/index.js';
import { createPrismaClientWithReplicas } from '@nexus/service-utils/prisma-client';
import { createTenantPrismaExtension } from '@nexus/service-utils/prisma-tenant';
import { withFieldEncryption } from '@nexus/security';
import { OutboxPublisher } from '@nexus/outbox';
import { TOPICS } from '@nexus/kafka';
import { AsyncLocalStorage } from 'node:async_hooks';

export const tenantAls = new AsyncLocalStorage<{ tenantId: string }>();

const outbox = new OutboxPublisher('notes-service');

function getEventType(model: string, operation: string): string | null {
  const base = model.toLowerCase();
  switch (operation) {
    case 'create': return `${base}.created`;
    case 'update': return `${base}.updated`;
    case 'upsert': return `${base}.updated`;
    case 'delete': return `${base}.deleted`;
    default: return null;
  }
}

async function publishEvent(
  prisma: any,
  model: string,
  operation: string,
  result: unknown
) {
  const eventType = getEventType(model, operation);
  if (!eventType) return;
  const record = result as Record<string, unknown> | null;
  if (!record) return;
  const tenantId = record.tenantId as string | undefined;
  if (!tenantId) return;
  const payload = operation === 'delete'
    ? { id: record.id, action: 'DELETED' as const, source: 'notes-service' }
    : { ...record, source: 'notes-service' };
  try {
    await outbox.publish(prisma, TOPICS.CONTACTS, payload, {
      eventType,
      tenantId,
      aggregateId: record.id as string | undefined,
    } as any);
  } catch (err) {
    const store = tenantAls.getStore();
    console.error(`Failed to outbox ${eventType}:`, err, { tenantId: store?.tenantId, payload });
  }
}

export function createNotesPrisma() {
  const base = createPrismaClientWithReplicas(
    (url: string) => new PrismaClient({ datasources: { db: { url } } }),
    { connectionLimit: 3, poolTimeout: 10, writeUrl: process.env.NOTES_DATABASE_URL }
  );

  const encryptionKey = process.env.ENCRYPTION_MASTER_KEY;
  if (encryptionKey && encryptionKey.length >= 32) {
    withFieldEncryption(base, encryptionKey, [
      { model: 'Note', fields: ['content'] },
    ]);
  }

  const tenantExt = createTenantPrismaExtension(base, {
    getTenantId: () => tenantAls.getStore()?.tenantId,
  });

  return base.$extends(tenantExt).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          const result = await query(args);
          if (['create', 'update', 'delete', 'upsert'].includes(operation)) {
            await publishEvent(base, model, operation, result);
          }
          return result;
        },
      },
    },
  });
}

export type NotesPrisma = ReturnType<typeof createNotesPrisma>;
