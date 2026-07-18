import { ValidationDomainError, type EngineContext } from '@nexus/domain-core';

export type CustomerEntityType = 'contact' | 'account';

type CustomerModuleService = {
  create: (tenantId: string, data: Record<string, unknown>, userId?: string, userName?: string) => Promise<unknown>;
  get: (tenantId: string, id: string) => Promise<Record<string, unknown>>;
  update: (tenantId: string, id: string, updates: Record<string, unknown>, userId?: string, userName?: string, roles?: string[]) => Promise<unknown>;
  archive: (tenantId: string, id: string, deletedBy?: string, deletedByName?: string) => Promise<unknown>;
  restore: (tenantId: string, id: string) => Promise<unknown>;
};

type CustomerRecordSnapshot = Record<string, unknown> & { id: string };

type CustomerRepository = {
  findFirst(args: unknown): Promise<CustomerRecordSnapshot | null>;
  findMany(args: unknown): Promise<CustomerRecordSnapshot[]>;
};

type LeadRepository = {
  findMany(args: unknown): Promise<Array<{ id: string; firstName: string; lastName: string; email: string | null }>>;
};

export type CustomerRecordsUseCaseDeps = {
  services: Record<CustomerEntityType, CustomerModuleService>;
  repositories: Record<CustomerEntityType, CustomerRepository>;
  leadRepository?: LeadRepository;
  recycle?: (input: {
    module: 'contacts' | 'accounts';
    recordId: string;
    recordSnapshot: CustomerRecordSnapshot;
    deletedBy: string;
  }) => Promise<void>;
};

export type CustomerMassUpdateInput = {
  entityType: CustomerEntityType;
  ids: string[];
  data: Record<string, unknown>;
};

export type CustomerMassArchiveInput = {
  entityType: CustomerEntityType;
  ids: string[];
};

export type CustomerDuplicateResult = {
  id: string;
  type: string;
  name: string;
  email?: string;
  score: number;
};

const ALLOWED_MASS_UPDATE_FIELDS: Record<CustomerEntityType, string[]> = {
  contact: ['ownerId', 'tags', 'customFields', 'isActive', 'doNotEmail', 'doNotCall', 'country', 'city', 'department'],
  account: [
    'ownerId',
    'tags',
    'customFields',
    'status',
    'type',
    'tier',
    'industry',
    'territoryId',
    'riskLevel',
    'healthScore',
    'lifecycleStage',
  ],
};

function actor(ctx: EngineContext) {
  return ctx.audit.actor;
}

function filterAllowedFields(entityType: CustomerEntityType, data: Record<string, unknown>): Record<string, unknown> {
  const allowed = ALLOWED_MASS_UPDATE_FIELDS[entityType];
  return Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key)));
}

function moduleName(entityType: CustomerEntityType): 'contacts' | 'accounts' {
  return entityType === 'contact' ? 'contacts' : 'accounts';
}

export function createCustomerRecordsUseCase(deps: CustomerRecordsUseCaseDeps) {
  async function create(ctx: EngineContext, input: { entityType: CustomerEntityType; data: Record<string, unknown> }): Promise<unknown> {
    return deps.services[input.entityType].create(actor(ctx).tenantId, input.data, actor(ctx).userId, actor(ctx).email);
  }

  async function update(ctx: EngineContext, input: { entityType: CustomerEntityType; id: string; data: Record<string, unknown> }): Promise<unknown> {
    return deps.services[input.entityType].update(actor(ctx).tenantId, input.id, input.data, actor(ctx).userId, actor(ctx).email, actor(ctx).roles ?? []);
  }

  async function get(ctx: EngineContext, input: { entityType: CustomerEntityType; id: string }): Promise<Record<string, unknown>> {
    return deps.services[input.entityType].get(actor(ctx).tenantId, input.id);
  }

  async function archive(ctx: EngineContext, input: { entityType: CustomerEntityType; id: string }): Promise<{ id: string; deleted: true }> {
    const row = await deps.repositories[input.entityType].findFirst({
      where: { id: input.id, tenantId: actor(ctx).tenantId },
    });
    await deps.services[input.entityType].archive(actor(ctx).tenantId, input.id, actor(ctx).userId, actor(ctx).email);
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

  async function restore(ctx: EngineContext, input: { entityType: CustomerEntityType; id: string }): Promise<unknown> {
    return deps.services[input.entityType].restore(actor(ctx).tenantId, input.id);
  }

  async function massUpdate(ctx: EngineContext, input: CustomerMassUpdateInput): Promise<{ count: number }> {
    const safeData = filterAllowedFields(input.entityType, input.data);
    if (!Object.keys(safeData).length) {
      throw new ValidationDomainError('NO_VALID_CUSTOMER_MASS_UPDATE_FIELDS', 'No valid customer mass update fields provided');
    }

    let count = 0;
    for (const id of input.ids) {
      await deps.services[input.entityType].update(actor(ctx).tenantId, id, safeData, actor(ctx).userId, actor(ctx).email, actor(ctx).roles ?? []);
      count += 1;
    }
    return { count };
  }

  async function massArchive(ctx: EngineContext, input: CustomerMassArchiveInput): Promise<{ count: number }> {
    const rows = await deps.repositories[input.entityType].findMany({
      where: { tenantId: actor(ctx).tenantId, id: { in: input.ids } },
    });

    let count = 0;
    for (const row of rows) {
      await deps.services[input.entityType].archive(actor(ctx).tenantId, row.id, actor(ctx).userId, actor(ctx).email);
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

  async function checkPersonDuplicates(
    ctx: EngineContext,
    input: { type: 'contact' | 'lead'; email?: string; phone?: string; firstName?: string; lastName?: string }
  ): Promise<CustomerDuplicateResult[]> {
    const results: CustomerDuplicateResult[] = [];
    const repository = input.type === 'contact' ? deps.repositories.contact : deps.leadRepository;
    if (!repository) return results;

    if (input.email) {
      const matches = await repository.findMany({
        where: { tenantId: actor(ctx).tenantId, email: { equals: input.email, mode: 'insensitive' } },
        take: 5,
        select: { id: true, firstName: true, lastName: true, email: true },
      }) as Array<{ id: string; firstName: string; lastName: string; email: string | null }>;
      for (const match of matches) {
        results.push({
          id: match.id,
          type: input.type.toUpperCase(),
          name: `${match.firstName} ${match.lastName}`,
          email: match.email ?? undefined,
          score: 95,
        });
      }
    }

    if (input.phone && results.length < 3) {
      const matches = await repository.findMany({
        where: { tenantId: actor(ctx).tenantId, phone: { contains: input.phone.slice(-8) } },
        take: 3,
        select: { id: true, firstName: true, lastName: true, email: true },
      }) as Array<{ id: string; firstName: string; lastName: string; email: string | null }>;
      for (const match of matches) {
        if (!results.find((item) => item.id === match.id)) {
          results.push({
            id: match.id,
            type: input.type.toUpperCase(),
            name: `${match.firstName} ${match.lastName}`,
            email: match.email ?? undefined,
            score: 80,
          });
        }
      }
    }

    if (input.firstName && input.lastName && results.length < 3) {
      const matches = await repository.findMany({
        where: {
          tenantId: actor(ctx).tenantId,
          firstName: { equals: input.firstName, mode: 'insensitive' },
          lastName: { equals: input.lastName, mode: 'insensitive' },
        },
        take: 3,
        select: { id: true, firstName: true, lastName: true, email: true },
      }) as Array<{ id: string; firstName: string; lastName: string; email: string | null }>;
      for (const match of matches) {
        if (!results.find((item) => item.id === match.id)) {
          results.push({
            id: match.id,
            type: input.type.toUpperCase(),
            name: `${match.firstName} ${match.lastName}`,
            email: match.email ?? undefined,
            score: 70,
          });
        }
      }
    }

    return results;
  }

  async function checkAccountDuplicates(ctx: EngineContext, input: { accountId: string }): Promise<CustomerRecordSnapshot[]> {
    const account = await deps.services.account.get(actor(ctx).tenantId, input.accountId);
    const accountName = typeof account.name === 'string' ? account.name.trim() : '';
    const website = typeof account.website === 'string' ? account.website : null;
    const websiteHost = website ? website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] : null;
    const possibleSignals: Array<Record<string, unknown> | null> = [
      typeof account.code === 'string' && account.code ? { code: account.code } : null,
      typeof account.taxId === 'string' && account.taxId ? { taxId: account.taxId } : null,
      typeof account.vatNumber === 'string' && account.vatNumber ? { vatNumber: account.vatNumber } : null,
      typeof account.email === 'string' && account.email ? { email: account.email } : null,
      typeof account.phone === 'string' && account.phone ? { phone: account.phone } : null,
      websiteHost ? { website: { contains: websiteHost, mode: 'insensitive' as const } } : null,
      accountName ? { name: { equals: accountName, mode: 'insensitive' as const } } : null,
    ];
    const or = possibleSignals.filter((value): value is Record<string, unknown> => value !== null);

    if (or.length === 0) return [];
    return deps.repositories.account.findMany({
      where: {
        tenantId: actor(ctx).tenantId,
        id: { not: input.accountId },
        deletedAt: null,
        OR: or,
      },
      select: {
        id: true,
        code: true,
        name: true,
        website: true,
        email: true,
        phone: true,
        taxId: true,
        vatNumber: true,
        city: true,
        country: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    });
  }

  return { create, update, get, archive, restore, massUpdate, massArchive, checkPersonDuplicates, checkAccountDuplicates };
}
