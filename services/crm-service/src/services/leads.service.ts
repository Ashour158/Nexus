import type { PaginatedResult } from '@nexus/shared-types';
import { BusinessRuleError, ConflictError, NotFoundError } from '@nexus/service-utils';
import type {
  ConvertLeadInput,
  CreateLeadInput,
  LeadListQuery,
  UpdateLeadInput,
} from '@nexus/validation';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { recordFieldChanges } from '../lib/field-history.js';
import { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type {
  Account,
  Contact,
  Deal,
  Lead,
} from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';
import { toPaginatedResult } from '@nexus/shared-types';
import { assignLeadToTerritory } from '../lib/territory-router.js';
import {
  updateLeadDataQuality,
  updateAccountDataQuality,
  updateContactDataQuality,
  updateDealDataQuality,
} from '../lib/data-quality.js';

type LeadListFilters = Omit<
  LeadListQuery,
  'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'
>;

interface ListPagination {
  page: number;
  limit: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
}

export interface LeadConversionResult {
  lead: Lead;
  account: Account;
  contact: Contact;
  deal: Deal | null;
}

function buildWhere(
  tenantId: string,
  filters: LeadListFilters
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { tenantId };
  if (filters.ownerId) where.ownerId = filters.ownerId;
  if (filters.status) where.status = filters.status;
  if (filters.source) where.source = filters.source;
  if (filters.rating) where.rating = filters.rating;
  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { company: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

function resolveSortField(
  sortBy: string | undefined
): keyof Prisma.LeadOrderByWithRelationInput {
  const allowed = new Set(['createdAt', 'updatedAt', 'score', 'lastName']);
  return (
    (sortBy && allowed.has(sortBy) ? sortBy : 'createdAt') as keyof Prisma.LeadOrderByWithRelationInput
  );
}

/**
 * Very simple rule-based scorer (Section 32). Richer deterministic scoring
 * lives inside CRM and does not depend on an external intelligence service.
 */
function scoreLead(data: Partial<Lead>): number {
  let score = 0;
  if (data.email) score += 15;
  if (data.phone) score += 10;
  if (data.jobTitle) score += 10;
  if (data.company) score += 10;
  if (data.industry) score += 5;
  if (data.website) score += 5;
  if (data.employeeCount && data.employeeCount > 100) score += 15;
  if (data.annualRevenue) {
    const rev = Number(data.annualRevenue);
    if (rev > 10_000_000) score += 20;
    else if (rev > 1_000_000) score += 10;
  }
  return Math.min(100, score);
}

export function createLeadsService(prisma: CrmPrisma, producer: NexusProducer) {
  async function loadOrThrow(tenantId: string, id: string): Promise<Lead> {
    const row = await prisma.lead.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundError('Lead', id);
    return row;
  }

  return {
    async listLeads(
      tenantId: string,
      filters: LeadListFilters,
      pagination: ListPagination
    ): Promise<PaginatedResult<Lead>> {
      const where = buildWhere(tenantId, filters);
      const sortField = resolveSortField(pagination.sortBy);
      const orderBy: Prisma.LeadOrderByWithRelationInput = {
        [sortField]: pagination.sortDir,
      };
      const [total, rows] = await Promise.all([
        prisma.lead.count({ where }),
        prisma.lead.findMany({
          where,
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
          orderBy,
        }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async getLeadById(tenantId: string, id: string): Promise<Lead> {
      return loadOrThrow(tenantId, id);
    },

    async findDuplicateLeads(
      tenantId: string,
      data: { email?: string | null; firstName?: string; lastName?: string; company?: string | null }
    ): Promise<Array<{ id: string; firstName: string; lastName: string; email: string | null; matchReason: string }>> {
      const duplicates: Array<{ id: string; firstName: string; lastName: string; email: string | null; matchReason: string }> = [];
      if (data.email) {
        const byEmail = await prisma.lead.findFirst({
          where: { tenantId, email: data.email, deletedAt: null },
        });
        if (byEmail) {
          duplicates.push({ id: byEmail.id, firstName: byEmail.firstName, lastName: byEmail.lastName, email: byEmail.email, matchReason: 'email' });
        }
      }
      if (data.firstName && data.lastName && data.company) {
        const byName = await prisma.lead.findFirst({
          where: {
            tenantId,
            firstName: { equals: data.firstName, mode: 'insensitive' },
            lastName: { equals: data.lastName, mode: 'insensitive' },
            company: { equals: data.company, mode: 'insensitive' },
            deletedAt: null,
          },
        });
        if (byName && !duplicates.some((d) => d.id === byName.id)) {
          duplicates.push({ id: byName.id, firstName: byName.firstName, lastName: byName.lastName, email: byName.email, matchReason: 'name+company' });
        }
      }
      return duplicates;
    },

    async createLead(tenantId: string, data: CreateLeadInput, force = false): Promise<Lead> {
      if (!force) {
        const duplicates = await this.findDuplicateLeads(tenantId, {
          email: data.email ?? null,
          firstName: data.firstName,
          lastName: data.lastName,
          company: data.company ?? null,
        });
        if (duplicates.length > 0) {
          const e = new ConflictError('Lead', 'duplicate');
          (e as any).duplicates = duplicates;
          throw e;
        }
      }
      const score = scoreLead(data as Partial<Lead>);
      const created = await prisma.lead.create({
        data: {
          tenantId,
          ownerId: data.ownerId,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email ?? null,
          phone: data.phone ?? null,
          company: data.company ?? null,
          jobTitle: data.jobTitle ?? null,
          source: data.source,
          rating: data.rating,
          industry: data.industry ?? null,
          website: data.website ?? null,
          annualRevenue:
            data.annualRevenue !== undefined ? new Prisma.Decimal(data.annualRevenue) : null,
          employeeCount: data.employeeCount ?? null,
          country: data.country ?? null,
          city: data.city ?? null,
          address: data.address ?? null,
          linkedInUrl: data.linkedInUrl ?? null,
          twitterHandle: data.twitterHandle ?? null,
          utmSource: data.utmSource ?? null,
          utmMedium: data.utmMedium ?? null,
          utmCampaign: data.utmCampaign ?? null,
          utmContent: data.utmContent ?? null,
          utmTerm: data.utmTerm ?? null,
          doNotContact: data.doNotContact ?? false,
          gdprConsent: data.gdprConsent ?? false,
          gdprConsentAt: data.gdprConsent ? new Date() : null,
          customFields: data.customFields as Prisma.InputJsonValue,
          tags: data.tags,
          score,
        },
      });

      await producer
        .publish(TOPICS.LEADS, {
          type: 'lead.created',
          tenantId,
          payload: {
            leadId: created.id,
            ownerId: created.ownerId,
            email: created.email ?? undefined,
            source: created.source,
          },
        })
        .catch(() => undefined);

      // Territory assignment (synchronous for immediate UX)
      const assignment = await assignLeadToTerritory(prisma, tenantId, created);
      if (assignment) {
        await prisma.lead.update({
          where: { id: created.id },
          data: {
            ownerId: assignment.userId,
            territoryId: assignment.territoryId,
            assignedTo: assignment.salesRepId,
          },
        });
      }

      // Data quality scoring (fire-and-forget)
      updateLeadDataQuality(prisma, created.id).catch(() => undefined);

      return created;
    },

    async updateLead(
      tenantId: string,
      id: string,
      data: UpdateLeadInput,
      changedBy?: string,
      changedByName?: string
    ): Promise<Lead> {
      const existing = await loadOrThrow(tenantId, id);
      const oldValues: Record<string, unknown> = {};
      const update: Prisma.LeadUpdateInput = {};
      const scalarFields: (keyof UpdateLeadInput)[] = [
        'firstName',
        'lastName',
        'email',
        'phone',
        'company',
        'jobTitle',
        'source',
        'rating',
        'status',
        'score',
        'industry',
        'website',
        'employeeCount',
        'country',
        'city',
        'address',
        'linkedInUrl',
        'twitterHandle',
        'utmSource',
        'utmMedium',
        'utmCampaign',
        'utmContent',
        'utmTerm',
        'ownerId',
        'doNotContact',
      ];
      for (const f of scalarFields) {
        if (data[f] !== undefined) {
          (update as Record<string, unknown>)[f] = data[f];
          (oldValues as Record<string, unknown>)[f] = (existing as Record<string, unknown>)[f];
        }
      }
      if (data.annualRevenue !== undefined) {
        update.annualRevenue = new Prisma.Decimal(data.annualRevenue);
        oldValues.annualRevenue = existing.annualRevenue;
      }
      if (data.gdprConsent !== undefined) {
        update.gdprConsent = data.gdprConsent;
        if (data.gdprConsent) update.gdprConsentAt = new Date();
      }
      if (data.customFields !== undefined) {
        update.customFields = data.customFields as Prisma.InputJsonValue;
        oldValues.customFields = existing.customFields;
      }
      if (data.tags !== undefined) { update.tags = data.tags; oldValues.tags = existing.tags; }

      const updated = await prisma.lead.update({ where: { id }, data: update });
      if (changedBy) {
        await recordFieldChanges(prisma, tenantId, 'lead', id, oldValues, data as Record<string, unknown>, changedBy, changedByName);
      }
      await producer
        .publish(TOPICS.LEADS, {
          type: 'lead.updated',
          tenantId,
          payload: {
            leadId: updated.id,
            ownerId: updated.ownerId,
            status: updated.status,
            score: updated.score,
            changedFields: Object.keys(update),
          },
        })
        .catch(() => undefined);
      // Recalculate data quality when key fields change
      updateLeadDataQuality(prisma, id).catch(() => undefined);
      return updated;
    },

    async deleteLead(tenantId: string, id: string): Promise<void> {
      const existing = await loadOrThrow(tenantId, id);
      await prisma.lead.update({ where: { id } as any, data: { deletedAt: new Date() } as any });
      await producer
        .publish(TOPICS.LEADS, {
          type: 'lead.archived',
          tenantId,
          payload: {
            leadId: existing.id,
            ownerId: existing.ownerId,
            status: existing.status,
          },
        })
        .catch(() => undefined);
    },

    async restoreLead(tenantId: string, id: string): Promise<Lead> {
      const result = await prisma.lead.updateMany({
        where: { id, tenantId, deletedAt: { not: null } } as any,
        data: { deletedAt: null } as any,
      });
      if (result.count === 0) throw new NotFoundError('Lead', id);
      const restored = await prisma.lead.findFirstOrThrow({ where: { id, tenantId } });
      await producer
        .publish(TOPICS.LEADS, {
          type: 'lead.restored',
          tenantId,
          payload: {
            leadId: restored.id,
            ownerId: restored.ownerId,
            status: restored.status,
          },
        })
        .catch(() => undefined);
      return restored;
    },

    /**
     * Converts a lead to Account + Contact + optionally a Deal (Section 34.2
     * → `POST /leads/:id/convert`). Executes all writes in a single
     * transaction and marks the lead as CONVERTED.
     */
    async convertLead(
      tenantId: string,
      id: string,
      input: ConvertLeadInput
    ): Promise<LeadConversionResult> {
      const lead = await loadOrThrow(tenantId, id);
      if (lead.status === 'CONVERTED') {
        throw new BusinessRuleError('Lead already converted');
      }

      if (input.createDeal && (!input.pipelineId || !input.stageId)) {
        throw new BusinessRuleError('pipelineId and stageId required to create a deal');
      }

      if (input.accountId) {
        const existing = await prisma.account.findFirst({
          where: { id: input.accountId, tenantId },
        });
        if (!existing) throw new NotFoundError('Account', input.accountId);
      }

      const result = await prisma.$transaction(async (tx) => {
        const account =
          input.accountId !== undefined
            ? await tx.account.update({
                where: { id: input.accountId },
                data: { updatedAt: new Date() },
              })
            : await tx.account.create({
                data: {
                  tenantId,
                  ownerId: lead.ownerId,
                  name: input.accountName ?? lead.company ?? `${lead.firstName} ${lead.lastName}`,
                  industry: lead.industry,
                  website: lead.website,
                  phone: lead.phone,
                  email: lead.email,
                  annualRevenue: lead.annualRevenue,
                  employeeCount: lead.employeeCount,
                  country: lead.country,
                  city: lead.city,
                  address: lead.address,
                  type: 'PROSPECT',
                  status: 'ACTIVE',
                },
              });

        const contact = await tx.contact.create({
          data: {
            tenantId,
            ownerId: lead.ownerId,
            accountId: account.id,
            firstName: lead.firstName,
            lastName: lead.lastName,
            email: lead.email,
            phone: lead.phone,
            jobTitle: lead.jobTitle,
            linkedInUrl: lead.linkedInUrl,
            country: lead.country,
            city: lead.city,
            address: lead.address,
            gdprConsent: lead.gdprConsent,
            gdprConsentAt: lead.gdprConsentAt,
            tags: lead.tags,
          },
        });

        let deal: Deal | null = null;
        if (input.createDeal) {
          const stage = await tx.stage.findFirst({
            where: { id: input.stageId as string, tenantId },
          });
          if (!stage) throw new NotFoundError('Stage', input.stageId as string);
          if (stage.pipelineId !== input.pipelineId) {
            throw new BusinessRuleError(
              'Stage does not belong to the given pipeline'
            );
          }
          deal = await tx.deal.create({
            data: {
              tenantId,
              ownerId: lead.ownerId,
              accountId: account.id,
              pipelineId: input.pipelineId as string,
              stageId: input.stageId as string,
              name: input.dealName ?? `${account.name} Opportunity`,
              amount: new Prisma.Decimal(input.dealAmount ?? 0),
              currency: 'USD',
              probability: stage.probability,
              contacts: { create: [{ tenantId, contactId: contact.id, isPrimary: true }] },
            },
          });
        }

        await tx.lead.update({
          where: { id },
          data: {
            status: 'CONVERTED',
            convertedAt: new Date(),
            convertedToId: account.id,
          },
        });

        const refreshed = await tx.lead.findFirstOrThrow({ where: { id } });
        return { lead: refreshed, account, contact, deal };
      });

      // Publish explicit conversion event for downstream listeners
      await producer
        .publish(TOPICS.LEADS, {
          type: 'lead.converted',
          tenantId,
          payload: {
            leadId: result.lead.id,
            accountId: result.account.id,
            contactId: result.contact.id,
            dealId: result.deal?.id,
            ownerId: result.lead.ownerId,
          },
        })
        .catch(() => undefined);

      if (result.deal) {
        await producer
          .publish(TOPICS.DEALS, {
            type: 'deal.created',
            tenantId,
            payload: {
              dealId: result.deal.id,
              ownerId: result.deal.ownerId,
              accountId: result.deal.accountId,
              amount: Number(result.deal.amount.toFixed(2)),
              currency: result.deal.currency,
              pipelineId: result.deal.pipelineId,
              stageId: result.deal.stageId,
            },
          })
          .catch(() => undefined);
      }

      // Compute data quality for converted records (fire-and-forget)
      updateAccountDataQuality(prisma, result.account.id).catch(() => undefined);
      updateContactDataQuality(prisma, result.contact.id).catch(() => undefined);
      if (result.deal) updateDealDataQuality(prisma, result.deal.id).catch(() => undefined);

      return result;
    },
  };
}

export type LeadsService = ReturnType<typeof createLeadsService>;
