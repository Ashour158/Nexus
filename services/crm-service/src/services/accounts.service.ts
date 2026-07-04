import type {
  AccountHealthInsight,
  PaginatedResult,
  TimelineEvent,
} from '@nexus/shared-types';
import { BusinessRuleError, NotFoundError } from '@nexus/service-utils';
import type {
  AccountListQuery,
  CreateAccountInput,
  UpdateAccountInput,
} from '@nexus/validation';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type {
  Account,
  Contact,
  Deal,
} from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';
import { toPaginatedResult } from '@nexus/shared-types';
import { updateAccountDataQuality } from '../lib/data-quality.js';
import { recordFieldChanges } from '../lib/field-history.js';
import {
  enforceValidationRules,
  applyFieldPermissions,
  mergeForValidation,
} from '../lib/write-guards.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type AccountListFilters = Omit<AccountListQuery, 'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'>;

interface ListPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildWhere(
  tenantId: string,
  filters: AccountListFilters
): Prisma.AccountWhereInput {
  const where: Prisma.AccountWhereInput = { tenantId };
  if (filters.ownerId) where.ownerId = filters.ownerId;
  if (filters.type) where.type = filters.type;
  if (filters.tier) where.tier = filters.tier;
  if (filters.status) where.status = filters.status;
  if (filters.industry) where.industry = filters.industry;
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { website: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

function resolveSortField(
  sortBy: string | undefined
): keyof Prisma.AccountOrderByWithRelationInput {
  const allowed = new Set(['createdAt', 'updatedAt', 'name', 'annualRevenue']);
  return (
    (sortBy && allowed.has(sortBy) ? sortBy : 'createdAt') as keyof Prisma.AccountOrderByWithRelationInput
  );
}

/**
 * Computes a simple 0–100 health score from signals available on the CRM side
 * (Section 32). The finance-service owns the richer MRR/usage-based scorer;
 * this is the CRM-local fallback returned by `GET /accounts/:id/health`.
 */
function computeHealth(
  account: Account,
  daysSinceLastTouch: number | null
): AccountHealthInsight {
  let score = 70;
  const factors: AccountHealthInsight['factors'] = [];

  if (typeof account.npsScore === 'number') {
    const npsFactor = Math.max(-40, Math.min(40, account.npsScore / 2));
    score += npsFactor;
    factors.push({
      code: 'NPS',
      label: 'Net Promoter Score',
      value: account.npsScore,
      impact: npsFactor > 0 ? 'POSITIVE' : npsFactor < 0 ? 'NEGATIVE' : 'NEUTRAL',
    });
  }

  if (daysSinceLastTouch !== null) {
    const touchPenalty = Math.min(25, Math.max(0, daysSinceLastTouch - 30));
    score -= touchPenalty;
    factors.push({
      code: 'LAST_TOUCH',
      label: 'Days since last customer touch',
      value: daysSinceLastTouch,
      impact: touchPenalty > 15 ? 'NEGATIVE' : touchPenalty > 0 ? 'NEUTRAL' : 'POSITIVE',
    });
  }

  if (account.status === 'AT_RISK') {
    score -= 20;
    factors.push({ code: 'STATUS', label: 'Status', value: 'AT_RISK', impact: 'NEGATIVE' });
  } else if (account.status === 'CHURNED') {
    score = Math.min(score, 20);
    factors.push({ code: 'STATUS', label: 'Status', value: 'CHURNED', impact: 'NEGATIVE' });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const status: AccountHealthInsight['status'] =
    score >= 75 ? 'HEALTHY' : score >= 50 ? 'AT_RISK' : score >= 25 ? 'CHURNING' : 'UNKNOWN';

  return {
    accountId: account.id,
    score,
    status,
    npsScore: account.npsScore,
    daysSinceLastTouch,
    openSupportTickets: null,
    factors,
    computedAt: new Date().toISOString(),
  };
}

// ─── Service Factory ────────────────────────────────────────────────────────

export function createAccountsService(prisma: CrmPrisma, producer: NexusProducer) {
  async function loadOrThrow(tenantId: string, id: string): Promise<Account> {
    const row = await prisma.account.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Account', id);
    return row;
  }

  return {
    async listAccounts(
      tenantId: string,
      filters: AccountListFilters,
      pagination: ListPagination
    ): Promise<PaginatedResult<Account>> {
      const where = buildWhere(tenantId, filters);
      const sortField = resolveSortField(pagination.sortBy);
      const orderBy: Prisma.AccountOrderByWithRelationInput = {
        [sortField]: pagination.sortDir,
      };
      const [total, rows] = await Promise.all([
        prisma.account.count({ where }),
        prisma.account.findMany({
          where,
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
          orderBy,
        }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async getAccountById(tenantId: string, id: string): Promise<Account> {
      return loadOrThrow(tenantId, id);
    },

    async createAccount(tenantId: string, data: CreateAccountInput): Promise<Account> {
      if (data.parentAccountId) {
        const parent = await prisma.account.findFirst({
          where: { id: data.parentAccountId, tenantId },
        });
        if (!parent) throw new NotFoundError('Account', data.parentAccountId);
      }
      // Enforce active validation rules (fail-open: no rules / eval error => allow).
      await enforceValidationRules(prisma, tenantId, 'account', data as Record<string, unknown>);
      const created = await prisma.account.create({
        data: {
          tenantId,
          ownerId: data.ownerId,
          parentAccountId: data.parentAccountId ?? null,
          code: data.code ?? null,
          name: data.name,
          legalName: data.legalName ?? null,
          tradeName: data.tradeName ?? null,
          website: data.website ?? null,
          phone: data.phone ?? null,
          fax: data.fax ?? null,
          email: data.email ?? null,
          industry: data.industry ?? null,
          subIndustry: data.subIndustry ?? null,
          type: data.type,
          tier: data.tier,
          status: data.status,
          lifecycleStage: data.lifecycleStage ?? null,
          annualRevenue:
            data.annualRevenue !== undefined ? new Prisma.Decimal(data.annualRevenue) : null,
          employeeCount: data.employeeCount ?? null,
          foundedYear: data.foundedYear ?? null,
          country: data.country ?? null,
          city: data.city ?? null,
          address: data.address ?? null,
          zipCode: data.zipCode ?? null,
          linkedInUrl: data.linkedInUrl ?? null,
          description: data.description ?? null,
          sicCode: data.sicCode ?? null,
          naicsCode: data.naicsCode ?? null,
          taxId: data.taxId ?? null,
          vatNumber: data.vatNumber ?? null,
          commercialRegistrationNumber: data.commercialRegistrationNumber ?? null,
          paymentTerms: data.paymentTerms ?? null,
          creditLimit: data.creditLimit !== undefined ? new Prisma.Decimal(data.creditLimit) : null,
          currency: data.currency ?? 'USD',
          priceBookId: data.priceBookId ?? null,
          territoryId: data.territoryId ?? null,
          healthScore: data.healthScore ?? null,
          npsScore: data.npsScore ?? null,
          riskLevel: data.riskLevel ?? null,
          lastActivityAt: data.lastActivityAt ? new Date(data.lastActivityAt) : null,
          billingAddressLine1: data.billingAddressLine1 ?? null,
          billingAddressLine2: data.billingAddressLine2 ?? null,
          billingCity: data.billingCity ?? null,
          billingState: data.billingState ?? null,
          billingPostalCode: data.billingPostalCode ?? null,
          billingCountry: data.billingCountry ?? null,
          billingLatitude: data.billingLatitude ?? null,
          billingLongitude: data.billingLongitude ?? null,
          shippingAddressLine1: data.shippingAddressLine1 ?? null,
          shippingAddressLine2: data.shippingAddressLine2 ?? null,
          shippingCity: data.shippingCity ?? null,
          shippingState: data.shippingState ?? null,
          shippingPostalCode: data.shippingPostalCode ?? null,
          shippingCountry: data.shippingCountry ?? null,
          shippingLatitude: data.shippingLatitude ?? null,
          shippingLongitude: data.shippingLongitude ?? null,
          shippingInstructions: data.shippingInstructions ?? null,
          sameAsBilling: data.sameAsBilling ?? false,
          customFields: data.customFields as Prisma.InputJsonValue,
          tags: data.tags,
        },
      });
      await producer
        .publish(TOPICS.ACCOUNTS, {
          type: 'account.created',
          tenantId,
          payload: {
            accountId: created.id,
            name: created.name,
            email: created.email ?? undefined,
            ownerId: created.ownerId,
          },
        })
        .catch(() => undefined);

      updateAccountDataQuality(prisma, created.id).catch(() => undefined);

      return created;
    },

    async updateAccount(
      tenantId: string,
      id: string,
      data: UpdateAccountInput,
      changedBy?: string,
      changedByName?: string,
      roles?: string[]
    ): Promise<Account> {
      const existing = await loadOrThrow(tenantId, id);
      const oldValues: Record<string, unknown> = {};
      const update: Prisma.AccountUpdateInput = {};
      if (data.code !== undefined) { update.code = data.code; oldValues.code = existing.code; }
      if (data.name !== undefined) { update.name = data.name; oldValues.name = existing.name; }
      if (data.ownerId !== undefined) { update.ownerId = data.ownerId; oldValues.ownerId = existing.ownerId; }
      if (data.parentAccountId !== undefined) {
        update.parentAccount = data.parentAccountId
          ? { connect: { id: data.parentAccountId } }
          : { disconnect: true };
      }
      if (data.website !== undefined) { update.website = data.website; oldValues.website = existing.website; }
      if (data.phone !== undefined) { update.phone = data.phone; oldValues.phone = existing.phone; }
      if (data.fax !== undefined) { update.fax = data.fax; oldValues.fax = existing.fax; }
      if (data.email !== undefined) { update.email = data.email; oldValues.email = existing.email; }
      if (data.industry !== undefined) { update.industry = data.industry; oldValues.industry = existing.industry; }
      if (data.legalName !== undefined) { update.legalName = data.legalName; oldValues.legalName = existing.legalName; }
      if (data.tradeName !== undefined) { update.tradeName = data.tradeName; oldValues.tradeName = existing.tradeName; }
      if (data.subIndustry !== undefined) { update.subIndustry = data.subIndustry; oldValues.subIndustry = existing.subIndustry; }
      if (data.type !== undefined) { update.type = data.type; oldValues.type = existing.type; }
      if (data.tier !== undefined) { update.tier = data.tier; oldValues.tier = existing.tier; }
      if (data.status !== undefined) { update.status = data.status; oldValues.status = existing.status; }
      if (data.lifecycleStage !== undefined) { update.lifecycleStage = data.lifecycleStage; oldValues.lifecycleStage = existing.lifecycleStage; }
      if (data.annualRevenue !== undefined) {
        update.annualRevenue = new Prisma.Decimal(data.annualRevenue);
        oldValues.annualRevenue = existing.annualRevenue;
      }
      if (data.employeeCount !== undefined) { update.employeeCount = data.employeeCount; oldValues.employeeCount = existing.employeeCount; }
      if (data.foundedYear !== undefined) { update.foundedYear = data.foundedYear; oldValues.foundedYear = existing.foundedYear; }
      if (data.country !== undefined) { update.country = data.country; oldValues.country = existing.country; }
      if (data.city !== undefined) { update.city = data.city; oldValues.city = existing.city; }
      if (data.address !== undefined) { update.address = data.address; oldValues.address = existing.address; }
      if (data.zipCode !== undefined) { update.zipCode = data.zipCode; oldValues.zipCode = existing.zipCode; }
      if (data.linkedInUrl !== undefined) { update.linkedInUrl = data.linkedInUrl; oldValues.linkedInUrl = existing.linkedInUrl; }
      if (data.description !== undefined) { update.description = data.description; oldValues.description = existing.description; }
      if (data.sicCode !== undefined) { update.sicCode = data.sicCode; oldValues.sicCode = existing.sicCode; }
      if (data.naicsCode !== undefined) { update.naicsCode = data.naicsCode; oldValues.naicsCode = existing.naicsCode; }
      if (data.taxId !== undefined) { update.taxId = data.taxId; oldValues.taxId = existing.taxId; }
      if (data.vatNumber !== undefined) { update.vatNumber = data.vatNumber; oldValues.vatNumber = existing.vatNumber; }
      if (data.commercialRegistrationNumber !== undefined) { update.commercialRegistrationNumber = data.commercialRegistrationNumber; oldValues.commercialRegistrationNumber = existing.commercialRegistrationNumber; }
      if (data.paymentTerms !== undefined) { update.paymentTerms = data.paymentTerms; oldValues.paymentTerms = existing.paymentTerms; }
      if (data.creditLimit !== undefined) { update.creditLimit = new Prisma.Decimal(data.creditLimit); oldValues.creditLimit = existing.creditLimit; }
      if (data.currency !== undefined) { update.currency = data.currency; oldValues.currency = existing.currency; }
      if (data.priceBookId !== undefined) { update.priceBookId = data.priceBookId; oldValues.priceBookId = existing.priceBookId; }
      if (data.territoryId !== undefined) { update.territoryId = data.territoryId; oldValues.territoryId = existing.territoryId; }
      if (data.healthScore !== undefined) { update.healthScore = data.healthScore; oldValues.healthScore = existing.healthScore; }
      if (data.npsScore !== undefined) { update.npsScore = data.npsScore; oldValues.npsScore = existing.npsScore; }
      if (data.riskLevel !== undefined) { update.riskLevel = data.riskLevel; oldValues.riskLevel = existing.riskLevel; }
      if (data.lastActivityAt !== undefined) { update.lastActivityAt = data.lastActivityAt ? new Date(data.lastActivityAt) : null; oldValues.lastActivityAt = existing.lastActivityAt; }
      if (data.billingAddressLine1 !== undefined) { update.billingAddressLine1 = data.billingAddressLine1; oldValues.billingAddressLine1 = existing.billingAddressLine1; }
      if (data.billingAddressLine2 !== undefined) { update.billingAddressLine2 = data.billingAddressLine2; oldValues.billingAddressLine2 = existing.billingAddressLine2; }
      if (data.billingCity !== undefined) { update.billingCity = data.billingCity; oldValues.billingCity = existing.billingCity; }
      if (data.billingState !== undefined) { update.billingState = data.billingState; oldValues.billingState = existing.billingState; }
      if (data.billingPostalCode !== undefined) { update.billingPostalCode = data.billingPostalCode; oldValues.billingPostalCode = existing.billingPostalCode; }
      if (data.billingCountry !== undefined) { update.billingCountry = data.billingCountry; oldValues.billingCountry = existing.billingCountry; }
      if (data.billingLatitude !== undefined) { update.billingLatitude = data.billingLatitude; oldValues.billingLatitude = existing.billingLatitude; }
      if (data.billingLongitude !== undefined) { update.billingLongitude = data.billingLongitude; oldValues.billingLongitude = existing.billingLongitude; }
      if (data.shippingAddressLine1 !== undefined) { update.shippingAddressLine1 = data.shippingAddressLine1; oldValues.shippingAddressLine1 = existing.shippingAddressLine1; }
      if (data.shippingAddressLine2 !== undefined) { update.shippingAddressLine2 = data.shippingAddressLine2; oldValues.shippingAddressLine2 = existing.shippingAddressLine2; }
      if (data.shippingCity !== undefined) { update.shippingCity = data.shippingCity; oldValues.shippingCity = existing.shippingCity; }
      if (data.shippingState !== undefined) { update.shippingState = data.shippingState; oldValues.shippingState = existing.shippingState; }
      if (data.shippingPostalCode !== undefined) { update.shippingPostalCode = data.shippingPostalCode; oldValues.shippingPostalCode = existing.shippingPostalCode; }
      if (data.shippingCountry !== undefined) { update.shippingCountry = data.shippingCountry; oldValues.shippingCountry = existing.shippingCountry; }
      if (data.shippingLatitude !== undefined) { update.shippingLatitude = data.shippingLatitude; oldValues.shippingLatitude = existing.shippingLatitude; }
      if (data.shippingLongitude !== undefined) { update.shippingLongitude = data.shippingLongitude; oldValues.shippingLongitude = existing.shippingLongitude; }
      if (data.shippingInstructions !== undefined) { update.shippingInstructions = data.shippingInstructions; oldValues.shippingInstructions = existing.shippingInstructions; }
      if (data.sameAsBilling !== undefined) { update.sameAsBilling = data.sameAsBilling; oldValues.sameAsBilling = existing.sameAsBilling; }
      if (data.customFields !== undefined) {
        update.customFields = data.customFields as Prisma.InputJsonValue;
        oldValues.customFields = existing.customFields;
      }
      if (data.tags !== undefined) { update.tags = data.tags; oldValues.tags = existing.tags; }

      // FieldPermission: strip fields the caller may not write (fail-open).
      const permResult = await applyFieldPermissions(
        prisma,
        tenantId,
        'account',
        update as Record<string, unknown>,
        roles
      );
      const safeUpdate = permResult.update as Prisma.AccountUpdateInput;

      // Validation rules run against the post-write record (existing + patch).
      await enforceValidationRules(
        prisma,
        tenantId,
        'account',
        mergeForValidation(existing as Record<string, unknown>, safeUpdate as Record<string, unknown>)
      );

      const updated = await prisma.account.update({ where: { id }, data: safeUpdate });
      if (changedBy) {
        await recordFieldChanges(prisma, tenantId, 'account', id, oldValues, data as Record<string, unknown>, changedBy, changedByName);
      }
      await producer
        .publish(TOPICS.ACCOUNTS, {
          type: 'account.updated',
          tenantId,
          payload: {
            accountId: updated.id,
            name: updated.name,
            ownerId: updated.ownerId,
            changedFields: Object.keys(oldValues),
          },
        })
        .catch(() => undefined);
      updateAccountDataQuality(prisma, id).catch(() => undefined);
      return updated;
    },

    /**
     * Soft-deletes an account. Refuses when open (non-lost/dormant) deals or active
     * contacts reference it; callers should reassign first.
     */
    async deleteAccount(tenantId: string, id: string): Promise<void> {
      const existing = await loadOrThrow(tenantId, id);
      if (existing.deletedAt) return;
      const [openDealCount, activeContactCount] = await Promise.all([
        prisma.deal.count({
          where: { accountId: id, tenantId, status: { in: ['OPEN', 'WON'] } },
        }),
        prisma.contact.count({
          where: { accountId: id, tenantId, isActive: true, deletedAt: null },
        }),
      ]);
      if (openDealCount > 0) {
        throw new BusinessRuleError('Account cannot be archived while open or won deals are linked');
      }
      if (activeContactCount > 0) {
        throw new BusinessRuleError('Account cannot be archived while active contacts are linked');
      }
      await prisma.account.update({ where: { id }, data: { deletedAt: new Date() } });
      await producer
        .publish(TOPICS.ACCOUNTS, {
          type: 'account.archived',
          tenantId,
          payload: {
            accountId: existing.id,
            name: existing.name,
            ownerId: existing.ownerId,
          },
        })
        .catch(() => undefined);
    },

    async restoreAccount(tenantId: string, id: string): Promise<Account> {
      const result = await prisma.account.updateMany({
        where: { id, tenantId, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      if (result.count === 0) throw new NotFoundError('Account', id);
      const restored = await prisma.account.findFirstOrThrow({ where: { id, tenantId } });
      await producer
        .publish(TOPICS.ACCOUNTS, {
          type: 'account.restored',
          tenantId,
          payload: {
            accountId: restored.id,
            name: restored.name,
            ownerId: restored.ownerId,
          },
        })
        .catch(() => undefined);
      return restored;
    },

    async listAccountContacts(
      tenantId: string,
      id: string,
      pagination: { page: number; limit: number; search?: string }
    ): Promise<PaginatedResult<Contact>> {
      await loadOrThrow(tenantId, id);
      const where: Prisma.ContactWhereInput = { accountId: id, tenantId };
      if (pagination.search?.trim()) {
        const q = pagination.search.trim();
        where.OR = [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ];
      }
      const [total, rows] = await Promise.all([
        prisma.contact.count({ where }),
        prisma.contact.findMany({
          where,
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async listAccountDeals(
      tenantId: string,
      id: string,
      pagination: {
        page: number;
        limit: number;
        status?: 'OPEN' | 'WON' | 'LOST' | 'DORMANT';
        pipelineId?: string;
      }
    ): Promise<PaginatedResult<Deal>> {
      await loadOrThrow(tenantId, id);
      const where: Prisma.DealWhereInput = { accountId: id, tenantId };
      if (pagination.status) where.status = pagination.status;
      else where.status = { not: 'DORMANT' };
      if (pagination.pipelineId) where.pipelineId = pagination.pipelineId;

      const [total, rows] = await Promise.all([
        prisma.deal.count({ where }),
        prisma.deal.findMany({
          where,
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async getAccountTimeline(
      tenantId: string,
      id: string,
      pagination: { page: number; limit: number }
    ): Promise<PaginatedResult<TimelineEvent>> {
      await loadOrThrow(tenantId, id);
      const [activities, notes] = await Promise.all([
        prisma.activity.findMany({
          where: { accountId: id, tenantId },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.note.findMany({
          where: { accountId: id, tenantId },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      const events: TimelineEvent[] = [
        ...activities.map<TimelineEvent>((a) => ({
          id: `activity:${a.id}`,
          type: 'ACTIVITY',
          at: a.createdAt.toISOString(),
          title: `${a.type}: ${a.subject}`,
          description: a.description ?? undefined,
          actorId: a.ownerId,
          metadata: { status: a.status, priority: a.priority, dueDate: a.dueDate?.toISOString() },
        })),
        ...notes.map<TimelineEvent>((n) => ({
          id: `note:${n.id}`,
          type: 'NOTE',
          at: n.createdAt.toISOString(),
          title: n.isPinned ? 'Pinned note' : 'Note',
          description: n.content,
          actorId: n.authorId,
          metadata: { isPinned: n.isPinned },
        })),
      ];
      events.sort((a, b) => (a.at < b.at ? 1 : -1));
      const total = events.length;
      const slice = events.slice(
        (pagination.page - 1) * pagination.limit,
        pagination.page * pagination.limit
      );
      return toPaginatedResult(slice, total, pagination.page, pagination.limit);
    },

    async getAccountHealth(tenantId: string, id: string): Promise<AccountHealthInsight> {
      const account = await loadOrThrow(tenantId, id);
      const latest = await prisma.activity.findFirst({
        where: { accountId: id, tenantId, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
      });
      const daysSince = latest
        ? Math.floor((Date.now() - latest.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return computeHealth(account, daysSince);
    },
  };
}

export type AccountsService = ReturnType<typeof createAccountsService>;
