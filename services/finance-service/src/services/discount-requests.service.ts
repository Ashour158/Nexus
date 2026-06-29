import { TOPICS, type NexusProducer } from '@nexus/kafka';
import { BusinessRuleError, NotFoundError } from '@nexus/service-utils';
import { toPaginatedResult, type PaginatedResult } from '@nexus/shared-types';
import type {
  CreateDiscountRequestInput,
  DiscountRequestListQuery,
} from '@nexus/validation';
import {
  Prisma,
  type DiscountRequest,
} from '../../../../node_modules/.prisma/finance-client/index.js';
import type { FinancePrisma } from '../prisma.js';

const DISCOUNT_REASON_LABELS: Record<string, string> = {
  COMPETITIVE_MATCH: 'Competitive match',
  STRATEGIC_ACCOUNT: 'Strategic account',
  VOLUME_COMMITMENT: 'Volume commitment',
  MULTI_YEAR_COMMITMENT: 'Multi-year commitment',
  NEW_LOGO_ACQUISITION: 'New logo acquisition',
  RENEWAL_SAVE: 'Renewal save',
  EXECUTIVE_EXCEPTION: 'Executive exception',
  MARKET_ENTRY: 'Market entry',
  BUNDLE_NEGOTIATION: 'Bundle negotiation',
  PAYMENT_TERMS_TRADEOFF: 'Payment terms trade-off',
};

type DiscountRequestFilters = Omit<
  DiscountRequestListQuery,
  'page' | 'limit' | 'sortBy' | 'sortDir' | 'cursor'
>;

async function createApprovalRequest(input: {
  tenantId: string;
  discountRequestId: string;
  quoteId: string;
  requestedById: string;
  data: Record<string, unknown>;
}) {
  const base = process.env.APPROVAL_SERVICE_URL ?? 'http://localhost:3014';
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  const res = await fetch(`${base}/api/v1/approval/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': input.tenantId,
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify({
      module: 'quote.discount_request',
      recordId: input.discountRequestId,
      requestedBy: input.requestedById,
      data: {
        ...input.data,
        entityType: 'quote',
        entityId: input.quoteId,
        discountRequestId: input.discountRequestId,
      },
    }),
  });
  if (!res.ok) return undefined;
  const json = (await res.json()) as { success?: boolean; data?: { id?: string } };
  return json.data?.id;
}

function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function currentDiscountPercent(subtotal: Prisma.Decimal, discount: Prisma.Decimal) {
  const subtotalNumber = Number(subtotal);
  if (subtotalNumber <= 0) return 0;
  return (Number(discount) / subtotalNumber) * 100;
}

export function createDiscountRequestsService(
  prisma: FinancePrisma,
  producer: NexusProducer
) {
  async function loadQuote(tenantId: string, quoteId: string) {
    const quote = await prisma.quote.findFirst({ where: { id: quoteId, tenantId } });
    if (!quote) throw new NotFoundError('Quote', quoteId);
    return quote;
  }

  return {
    reasonOptions() {
      return Object.entries(DISCOUNT_REASON_LABELS).map(([code, label]) => ({
        code,
        label,
      }));
    },

    async listDiscountRequests(
      tenantId: string,
      filters: DiscountRequestFilters,
      pagination: { page: number; limit: number; sortDir: 'asc' | 'desc' }
    ): Promise<PaginatedResult<DiscountRequest>> {
      const where: Prisma.DiscountRequestWhereInput = {
        tenantId,
        quoteId: filters.quoteId,
        requestedById: filters.requestedById,
        status: filters.status,
      };
      const [total, rows] = await Promise.all([
        prisma.discountRequest.count({ where }),
        prisma.discountRequest.findMany({
          where,
          skip: (pagination.page - 1) * pagination.limit,
          take: pagination.limit,
          orderBy: { createdAt: pagination.sortDir },
        }),
      ]);
      return toPaginatedResult(rows, total, pagination.page, pagination.limit);
    },

    async createDiscountRequest(
      tenantId: string,
      data: CreateDiscountRequestInput,
      fallbackRequesterId: string
    ): Promise<DiscountRequest> {
      const quote = await loadQuote(tenantId, data.quoteId);
      if (!['DRAFT', 'PENDING_APPROVAL'].includes(quote.status)) {
        throw new BusinessRuleError(
          `Cannot request discount for quote in status ${quote.status}`
        );
      }
      if (quote.subtotal.lte(0)) {
        throw new BusinessRuleError('Discount request requires a positive quote subtotal');
      }
      const customFields = data.customFields && typeof data.customFields === 'object'
        ? data.customFields as Record<string, unknown>
        : {};
      const hierarchy = customFields.approverHierarchy;
      if (!Array.isArray(hierarchy) || hierarchy.length === 0) {
        throw new BusinessRuleError('Discount request requires at least one approver level');
      }

      const requestedById = data.requestedById ?? fallbackRequesterId;
      const requestedDiscountAmount = quote.subtotal
        .times(data.requestedDiscountPercent)
        .div(100);
      const currentPercent = currentDiscountPercent(
        quote.subtotal,
        quote.discountAmount
      );
      if (data.requestedDiscountPercent <= currentPercent) {
        throw new BusinessRuleError(
          'Requested discount must be greater than the current quote discount'
        );
      }

      const pending = await prisma.discountRequest.findFirst({
        where: { tenantId, quoteId: quote.id, status: 'PENDING' },
      });
      if (pending) return pending;

      const reasonLabel =
        DISCOUNT_REASON_LABELS[data.reasonCode] ?? data.reasonCode;

      const created = await prisma.$transaction(async (tx) => {
        const request = await tx.discountRequest.create({
          data: {
            tenantId,
            quoteId: quote.id,
            requestedById,
            status: 'PENDING',
            reasonCode: data.reasonCode,
            reasonLabel,
            reasonNotes: data.reasonNotes ?? null,
            currentDiscountPercent: toDecimal(currentPercent),
            requestedDiscountPercent: toDecimal(data.requestedDiscountPercent),
            requestedDiscountAmount,
            winningProbabilityIfApproved: data.winningProbabilityIfApproved,
            businessImpact: data.businessImpact ?? null,
            competitorName: data.competitorName ?? null,
            expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
            customFields: customFields as Prisma.InputJsonValue,
          },
        });
        await tx.quote.update({
          where: { id: quote.id },
          data: {
            status: 'PENDING_APPROVAL',
            approvalRequired: true,
            approvalStatus: 'PENDING',
            pricingBreakdown: {
              ...(quote.pricingBreakdown as Record<string, unknown>),
              discountRequestId: request.id,
              requestedDiscountPercent: data.requestedDiscountPercent,
              discountReasonCode: data.reasonCode,
              winningProbabilityIfApproved: data.winningProbabilityIfApproved,
            } as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        });
        return request;
      });

      const approvalRequestId = await createApprovalRequest({
        tenantId,
        discountRequestId: created.id,
        quoteId: quote.id,
        requestedById,
        data: {
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          accountId: quote.accountId,
          contactId: quote.contactId,
          dealId: quote.dealId,
          currency: quote.currency,
          subtotal: quote.subtotal.toString(),
          currentDiscountPercent: currentPercent,
          requestedDiscountPercent: data.requestedDiscountPercent,
          requestedDiscountAmount: requestedDiscountAmount.toString(),
          reasonCode: data.reasonCode,
          reasonLabel,
          reasonNotes: data.reasonNotes,
          winningProbabilityIfApproved: data.winningProbabilityIfApproved,
          businessImpact: data.businessImpact,
          competitorName: data.competitorName,
        },
      });

      const withApproval = approvalRequestId
        ? await prisma.discountRequest.update({
            where: { id: created.id },
            data: { approvalRequestId },
          })
        : created;

      await producer
        .publish(TOPICS.QUOTES, {
          type: 'quote.discount_request.created',
          tenantId,
          payload: {
            discountRequestId: withApproval.id,
            approvalRequestId,
            quoteId: quote.id,
            accountId: quote.accountId,
            contactId: quote.contactId,
            dealId: quote.dealId,
            requestedDiscountPercent: data.requestedDiscountPercent,
            reasonCode: data.reasonCode,
            winningProbabilityIfApproved: data.winningProbabilityIfApproved,
          },
        })
        .catch(() => undefined);

      return withApproval;
    },
  };
}

export type DiscountRequestsService = ReturnType<typeof createDiscountRequestsService>;
