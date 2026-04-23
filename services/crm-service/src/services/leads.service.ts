import type { PaginatedResult } from '@nexus/shared-types';
import { BusinessRuleError, NotFoundError } from '@nexus/service-utils';
import type {
  ConvertLeadInput,
  CreateLeadInput,
  LeadListQuery,
  UpdateLeadInput,
} from '@nexus/validation';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type {
  Account,
  Contact,
  Deal,
  Lead,
} from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';
import { toPaginatedResult } from '../lib/pagination.js';

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
 * Very simple rule-based scorer (Section 32) — richer AI scoring is delegated
 * to the AI service in Phase 3.
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

    async createLead(tenantId: string, data: CreateLeadInput): Promise<Lead> {
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

      return created;
    },

    async updateLead(
      tenantId: string,
      id: string,
      data: UpdateLeadInput
    ): Promise<Lead> {
      await loadOrThrow(tenantId, id);
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
        }
      }
      if (data.annualRevenue !== undefined) {
        update.annualRevenue = new Prisma.Decimal(data.annualRevenue);
      }
      if (data.gdprConsent !== undefined) {
        update.gdprConsent = data.gdprConsent;
        if (data.gdprConsent) update.gdprConsentAt = new Date();
      }
      if (data.customFields !== undefined) {
        update.customFields = data.customFields as Prisma.InputJsonValue;
      }
      if (data.tags !== undefined) update.tags = data.tags;

      return prisma.lead.update({ where: { id }, data: update });
    },

    async deleteLead(tenantId: string, id: string): Promise<void> {
      await loadOrThrow(tenantId, id);
      await prisma.lead.delete({ where: { id } });
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
              contacts: { create: [{ contactId: contact.id, isPrimary: true }] },
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

      return result;
    },
  };
}

export type LeadsService = ReturnType<typeof createLeadsService>;
