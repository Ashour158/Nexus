import { InvariantDomainError, NotFoundDomainError, PermissionDomainError, ValidationDomainError, type EngineContext } from '@nexus/domain-core';
import type { NexusProducer } from '@nexus/kafka';
import type { JwtPayload } from '@nexus/shared-types';
import type { CrmPrisma } from '../prisma.js';
import { partitionWritableRecords, type SkippedRecord } from '../lib/record-write-guard.js';

export type BulkEntityType = 'contact' | 'deal' | 'lead' | 'account';
export type BulkReassignEntityType = BulkEntityType | 'all';

type ModuleService = {
  update: (tenantId: string, id: string, updates: Record<string, unknown>, userId?: string) => Promise<unknown>;
  archive: (tenantId: string, id: string, deletedBy?: string, deletedByName?: string) => Promise<unknown>;
};

export type BulkRecordsUseCaseDeps = {
  services: Record<BulkEntityType, ModuleService>;
  prisma: CrmPrisma;
  producer: Pick<NexusProducer, 'publish'>;
};

export type BulkUpdateInput = {
  entityType: BulkEntityType;
  ids: string[];
  updates: Record<string, unknown>;
};

export type BulkDeleteInput = {
  entityType: BulkEntityType;
  ids: string[];
  hard?: boolean;
};

export type BulkTagInput = {
  entityType: BulkEntityType;
  ids: string[];
  addTags: string[];
  removeTags: string[];
};

export type BulkReassignInput = {
  entityType: BulkReassignEntityType;
  ids?: string[];
  toUserId: string;
  fromUserId?: string;
};

const ALLOWED_FIELDS: Record<BulkEntityType, string[]> = {
  contact: ['ownerId', 'tags', 'isActive', 'doNotEmail', 'doNotCall', 'country', 'city', 'department'],
  deal: ['ownerId', 'stageId', 'pipelineId', 'status', 'forecastCategory', 'tags'],
  lead: ['ownerId', 'status', 'rating', 'tags', 'doNotContact'],
  account: ['ownerId', 'type', 'tier', 'status', 'tags', 'country', 'city'],
};

function actor(ctx: EngineContext) {
  return ctx.audit.actor;
}

/**
 * Reconstruct a JwtPayload from the engine actor so the shared record-write
 * guard (record lock → sharing) can be applied per-record on bulk paths.
 */
function jwtFromCtx(ctx: EngineContext): JwtPayload {
  const a = actor(ctx);
  return { sub: a.userId, tenantId: a.tenantId, email: a.email ?? '', roles: a.roles ?? [] };
}

function requireManagerOrAdmin(ctx: EngineContext): void {
  const roles = new Set(actor(ctx).roles.map((role) => role.toLowerCase()));
  if (!roles.has('admin') && !roles.has('manager')) {
    throw new PermissionDomainError('BULK_REASSIGN_FORBIDDEN', 'Only admins and managers can bulk reassign');
  }
}

function filterAllowedFields(entityType: BulkEntityType, updates: Record<string, unknown>): Record<string, unknown> {
  const safeUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (ALLOWED_FIELDS[entityType].includes(key)) safeUpdates[key] = value;
  }
  return safeUpdates;
}

async function findRowsForEntity(prisma: CrmPrisma, entityType: BulkEntityType, where: Record<string, unknown>) {
  const client = (prisma as unknown as Record<BulkEntityType, { findMany: (args: unknown) => Promise<Array<{ id: string; tags?: string[] }>> }>)[entityType];
  return client.findMany({ where, select: { id: true, tags: true } });
}

export function createBulkRecordsUseCase(deps: BulkRecordsUseCaseDeps) {
  async function bulkUpdate(ctx: EngineContext, input: BulkUpdateInput): Promise<{ updated: number; skipped: SkippedRecord[] }> {
    const safeUpdates = filterAllowedFields(input.entityType, input.updates);
    if (!Object.keys(safeUpdates).length) {
      throw new ValidationDomainError('NO_VALID_BULK_UPDATE_FIELDS', 'No valid update fields provided');
    }

    // Data-governance guard (opt-in): skip locked/sharing-restricted records.
    const { allowed, skipped } = await partitionWritableRecords(deps.prisma, jwtFromCtx(ctx), input.entityType, input.ids);

    let count = 0;
    for (const id of allowed) {
      await deps.services[input.entityType].update(actor(ctx).tenantId, id, safeUpdates, actor(ctx).userId);
      count += 1;
    }

    await deps.producer.publish(`${input.entityType}.bulk.updated`, {
      type: `${input.entityType}.bulk.updated`,
      tenantId: actor(ctx).tenantId,
      userId: actor(ctx).userId,
      entityType: input.entityType,
      ids: allowed,
      updates: safeUpdates,
      count,
    });

    return { updated: count, skipped };
  }

  async function bulkDelete(ctx: EngineContext, input: BulkDeleteInput): Promise<{ deleted: number; skipped: SkippedRecord[] }> {
    if (input.hard) {
      throw new InvariantDomainError(
        'UNSUPPORTED_BULK_HARD_DELETE',
        'Hard delete is not supported through bulk operations. Use module-specific archival governance.'
      );
    }

    // Data-governance guard (opt-in): skip locked/sharing-restricted records.
    const { allowed, skipped } = await partitionWritableRecords(deps.prisma, jwtFromCtx(ctx), input.entityType, input.ids);

    let count = 0;
    for (const id of allowed) {
      await deps.services[input.entityType].archive(actor(ctx).tenantId, id, actor(ctx).userId, actor(ctx).email);
      count += 1;
    }

    await deps.producer.publish(`${input.entityType}.bulk.deleted`, {
      type: `${input.entityType}.bulk.deleted`,
      tenantId: actor(ctx).tenantId,
      userId: actor(ctx).userId,
      entityType: input.entityType,
      ids: allowed,
      hard: false,
      count,
    });

    return { deleted: count, skipped };
  }

  async function bulkTag(ctx: EngineContext, input: BulkTagInput): Promise<{ processed: number; skipped: SkippedRecord[] }> {
    const rows = await findRowsForEntity(deps.prisma, input.entityType, {
      id: { in: input.ids },
      tenantId: actor(ctx).tenantId,
      deletedAt: null,
    });

    // Data-governance guard (opt-in): skip locked/sharing-restricted records.
    const { allowed, skipped } = await partitionWritableRecords(
      deps.prisma,
      jwtFromCtx(ctx),
      input.entityType,
      rows.map((row) => row.id)
    );
    const allowedSet = new Set(allowed);

    let processed = 0;
    for (const row of rows) {
      if (!allowedSet.has(row.id)) continue;
      const existingTags = row.tags ?? [];
      const tags = [...new Set([...existingTags.filter((tag) => !input.removeTags.includes(tag)), ...input.addTags])];
      await deps.services[input.entityType].update(actor(ctx).tenantId, row.id, { tags }, actor(ctx).userId);
      processed += 1;
    }

    return { processed, skipped };
  }

  async function bulkReassign(ctx: EngineContext, input: BulkReassignInput): Promise<{ results: Record<string, number>; skipped: SkippedRecord[] }> {
    requireManagerOrAdmin(ctx);

    const targetUser = await (deps.prisma as any).user.findFirst({ where: { id: input.toUserId, tenantId: actor(ctx).tenantId } });
    if (!targetUser) {
      throw new NotFoundDomainError('TARGET_USER_NOT_IN_TENANT', 'Target user does not exist in this tenant');
    }

    const where = input.ids?.length
      ? { id: { in: input.ids }, tenantId: actor(ctx).tenantId, deletedAt: null }
      : input.fromUserId
        ? { ownerId: input.fromUserId, tenantId: actor(ctx).tenantId, deletedAt: null }
        : null;

    if (!where) {
      throw new ValidationDomainError('BULK_REASSIGN_SCOPE_REQUIRED', 'Provide either ids or fromUserId');
    }

    const entities: BulkEntityType[] = input.entityType === 'all' ? ['contact', 'deal', 'lead', 'account'] : [input.entityType];
    const results: Record<string, number> = {};
    const skipped: SkippedRecord[] = [];
    const jwt = jwtFromCtx(ctx);

    for (const entity of entities) {
      const rows = await findRowsForEntity(deps.prisma, entity, where);
      // Data-governance guard (opt-in): skip locked/sharing-restricted records.
      const partition = await partitionWritableRecords(deps.prisma, jwt, entity, rows.map((row) => row.id));
      for (const id of partition.allowed) {
        await deps.services[entity].update(actor(ctx).tenantId, id, { ownerId: input.toUserId }, actor(ctx).userId);
      }
      results[`${entity}s`] = partition.allowed.length;
      skipped.push(...partition.skipped);
    }

    await deps.producer.publish('records.bulk.reassigned', {
      type: 'records.bulk.reassigned',
      tenantId: actor(ctx).tenantId,
      userId: actor(ctx).userId,
      toUserId: input.toUserId,
      fromUserId: input.fromUserId,
      entityType: input.entityType,
      results,
    });

    return { results, skipped };
  }

  return { bulkUpdate, bulkDelete, bulkTag, bulkReassign };
}
