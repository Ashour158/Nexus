import { ValidationDomainError, type EngineContext } from '@nexus/domain-core';

export type SalesEntityType = 'lead' | 'deal';

type LeadServiceAdapter = {
  create: (tenantId: string, data: Record<string, unknown>, force?: boolean) => Promise<unknown>;
  get: (tenantId: string, id: string) => Promise<Record<string, unknown>>;
  update: (tenantId: string, id: string, data: Record<string, unknown>, userId?: string, userName?: string, roles?: string[]) => Promise<unknown>;
  archive: (tenantId: string, id: string, deletedBy?: string, deletedByName?: string) => Promise<unknown>;
  restore: (tenantId: string, id: string) => Promise<unknown>;
  convert: (tenantId: string, id: string, data: Record<string, unknown>) => Promise<unknown>;
  findDuplicates: (
    tenantId: string,
    data: { email?: string | null; firstName?: string; lastName?: string; company?: string | null }
  ) => Promise<Array<Record<string, unknown> & { id: string }>>;
};

type DealServiceAdapter = {
  create: (tenantId: string, data: Record<string, unknown>) => Promise<unknown>;
  get: (tenantId: string, id: string) => Promise<Record<string, unknown>>;
  update: (tenantId: string, id: string, data: Record<string, unknown>, actor?: { userId: string; userEmail?: string }, roles?: string[]) => Promise<unknown>;
  archive: (tenantId: string, id: string, deletedBy?: string, deletedByName?: string) => Promise<unknown>;
  restore: (tenantId: string, id: string) => Promise<unknown>;
  moveStage: (tenantId: string, id: string, stageId: string) => Promise<unknown>;
  markWon: (tenantId: string, id: string) => Promise<unknown>;
  markLost: (tenantId: string, id: string, reason: string, detail?: string) => Promise<unknown>;
};

type SalesRecordSnapshot = Record<string, unknown> & { id: string };

type SalesRepository = {
  findFirst(args: unknown): Promise<SalesRecordSnapshot | null>;
  findMany(args: unknown): Promise<SalesRecordSnapshot[]>;
};

export type SalesRecordsUseCaseDeps = {
  leads: LeadServiceAdapter;
  deals: DealServiceAdapter;
  repositories: Record<SalesEntityType, SalesRepository>;
  recycle?: (input: {
    module: 'leads' | 'deals';
    recordId: string;
    recordSnapshot: SalesRecordSnapshot;
    deletedBy: string;
  }) => Promise<void>;
};

const ALLOWED_MASS_UPDATE_FIELDS: Record<SalesEntityType, string[]> = {
  lead: ['ownerId', 'status', 'rating', 'tags', 'customFields', 'doNotContact'],
  deal: ['ownerId', 'stageId', 'pipelineId', 'forecastCategory', 'tags', 'customFields', 'status'],
};

function actor(ctx: EngineContext) {
  return ctx.audit.actor;
}

function filterAllowedFields(entityType: SalesEntityType, data: Record<string, unknown>): Record<string, unknown> {
  const allowed = ALLOWED_MASS_UPDATE_FIELDS[entityType];
  return Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key)));
}

function moduleName(entityType: SalesEntityType): 'leads' | 'deals' {
  return entityType === 'lead' ? 'leads' : 'deals';
}

export function createSalesRecordsUseCase(deps: SalesRecordsUseCaseDeps) {
  function service(entityType: SalesEntityType) {
    return entityType === 'lead' ? deps.leads : deps.deals;
  }

  async function create(ctx: EngineContext, input: { entityType: 'lead'; data: Record<string, unknown>; force?: boolean } | { entityType: 'deal'; data: Record<string, unknown> }): Promise<unknown> {
    if (input.entityType === 'lead') return deps.leads.create(actor(ctx).tenantId, input.data, input.force);
    return deps.deals.create(actor(ctx).tenantId, input.data);
  }

  async function get(ctx: EngineContext, input: { entityType: SalesEntityType; id: string }): Promise<Record<string, unknown>> {
    return service(input.entityType).get(actor(ctx).tenantId, input.id);
  }

  async function update(ctx: EngineContext, input: { entityType: SalesEntityType; id: string; data: Record<string, unknown> }): Promise<unknown> {
    const callerRoles = actor(ctx).roles ?? [];
    if (input.entityType === 'lead') {
      return deps.leads.update(actor(ctx).tenantId, input.id, input.data, actor(ctx).userId, actor(ctx).email, callerRoles);
    }
    return deps.deals.update(actor(ctx).tenantId, input.id, input.data, { userId: actor(ctx).userId, userEmail: actor(ctx).email }, callerRoles);
  }

  async function archive(ctx: EngineContext, input: { entityType: SalesEntityType; id: string }): Promise<{ id: string; deleted: true }> {
    const row = await deps.repositories[input.entityType].findFirst({
      where: { id: input.id, tenantId: actor(ctx).tenantId },
    });
    await service(input.entityType).archive(actor(ctx).tenantId, input.id, actor(ctx).userId, actor(ctx).email);
    if (row) {
      await Promise.resolve(deps.recycle?.({
        module: moduleName(input.entityType),
        recordId: row.id,
        recordSnapshot: row,
        deletedBy: actor(ctx).userId,
      })).catch(() => undefined);
    }
    return { id: input.id, deleted: true };
  }

  async function restore(ctx: EngineContext, input: { entityType: SalesEntityType; id: string }): Promise<unknown> {
    return service(input.entityType).restore(actor(ctx).tenantId, input.id);
  }

  async function massUpdate(ctx: EngineContext, input: { entityType: SalesEntityType; ids: string[]; data: Record<string, unknown> }): Promise<{ count: number }> {
    const safeData = filterAllowedFields(input.entityType, input.data);
    if (!Object.keys(safeData).length) {
      throw new ValidationDomainError('NO_VALID_SALES_MASS_UPDATE_FIELDS', 'No valid sales mass update fields provided');
    }

    let count = 0;
    for (const id of input.ids) {
      await update(ctx, { entityType: input.entityType, id, data: safeData });
      count += 1;
    }
    return { count };
  }

  async function massArchive(ctx: EngineContext, input: { entityType: SalesEntityType; ids: string[] }): Promise<{ count: number }> {
    const rows = await deps.repositories[input.entityType].findMany({
      where: { tenantId: actor(ctx).tenantId, id: { in: input.ids } },
    });

    let count = 0;
    for (const row of rows) {
      await service(input.entityType).archive(actor(ctx).tenantId, row.id, actor(ctx).userId, actor(ctx).email);
      count += 1;
      await Promise.resolve(deps.recycle?.({
        module: moduleName(input.entityType),
        recordId: row.id,
        recordSnapshot: row,
        deletedBy: actor(ctx).userId,
      })).catch(() => undefined);
    }
    return { count };
  }

  async function convertLead(ctx: EngineContext, input: { leadId: string; data: Record<string, unknown> }): Promise<unknown> {
    return deps.leads.convert(actor(ctx).tenantId, input.leadId, input.data);
  }

  async function checkLeadDuplicates(ctx: EngineContext, input: { leadId: string }): Promise<Array<Record<string, unknown> & { id: string }>> {
    const lead = await deps.leads.get(actor(ctx).tenantId, input.leadId);
    const duplicates = await deps.leads.findDuplicates(actor(ctx).tenantId, {
      email: typeof lead.email === 'string' ? lead.email : null,
      firstName: typeof lead.firstName === 'string' ? lead.firstName : undefined,
      lastName: typeof lead.lastName === 'string' ? lead.lastName : undefined,
      company: typeof lead.company === 'string' ? lead.company : null,
    });
    return duplicates.filter((item) => item.id !== input.leadId);
  }

  async function moveDealStage(ctx: EngineContext, input: { dealId: string; stageId: string }): Promise<unknown> {
    return deps.deals.moveStage(actor(ctx).tenantId, input.dealId, input.stageId);
  }

  async function markDealWon(ctx: EngineContext, input: { dealId: string }): Promise<unknown> {
    return deps.deals.markWon(actor(ctx).tenantId, input.dealId);
  }

  async function markDealLost(ctx: EngineContext, input: { dealId: string; reason: string; detail?: string }): Promise<unknown> {
    return deps.deals.markLost(actor(ctx).tenantId, input.dealId, input.reason, input.detail);
  }

  return {
    create,
    get,
    update,
    archive,
    restore,
    massUpdate,
    massArchive,
    convertLead,
    checkLeadDuplicates,
    moveDealStage,
    markDealWon,
    markDealLost,
  };
}
