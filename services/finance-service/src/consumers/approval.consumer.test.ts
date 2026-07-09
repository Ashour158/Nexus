import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../../../node_modules/.prisma/finance-client/index.js';
import { handleApprovalApproved, handleApprovalRejected } from './approval.consumer.js';

describe('finance approval consumer', () => {
  it('routes approved DRQ callbacks through CPQ transition authority', async () => {
    const tx = {
      discountRequest: {
        update: vi.fn(async ({ data }) => ({ id: 'drq_1', ...data })),
      },
      quote: {
        update: vi.fn(async ({ data }) => ({ id: 'quote_1', ...data })),
      },
      quoteRevision: {
        create: vi.fn(async ({ data }) => ({ id: 'rev_2', ...data })),
      },
    };
    const prisma = {
      discountRequest: {
        findFirst: vi.fn(async () => ({
          id: 'drq_1',
          quoteId: 'quote_1',
          status: 'PENDING',
          requestedDiscountPercent: new Prisma.Decimal(15),
          requestedDiscountAmount: new Prisma.Decimal(15),
          customFields: { quoteRevisionId: 'rev_1' },
        })),
        update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      },
      quote: {
        findFirst: vi.fn(async () => ({
          id: 'quote_1',
          tenantId: 'tenant_1',
          quoteNumber: 'QUO-2026-00001',
          status: 'PENDING_APPROVAL',
          approvalStatus: 'PENDING',
          version: 1,
          discountAmount: new Prisma.Decimal(0),
          total: new Prisma.Decimal(100),
        })),
        update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      },
      quoteRevision: {
        findFirst: vi.fn(async () => ({ id: 'rev_1', quoteId: 'quote_1', version: 1, status: 'PENDING_APPROVAL' })),
        create: vi.fn(async ({ data }) => ({ id: 'rev_2', ...data })),
      },
      quoteESignEnvelope: {
        findFirst: vi.fn(async () => null),
      },
      outboxMessage: {
        create: vi.fn(async ({ data }) => ({ id: 'outbox_1', ...data })),
      },
      $transaction: vi.fn(async (fn) => fn(tx)),
    };
    const producer = {
      publish: vi.fn(async () => undefined),
    };
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    await handleApprovalApproved(prisma as never, log, {
      tenantId: 'tenant_1',
      payload: {
        module: 'quote.discount_request',
        recordId: 'drq_1',
        approvedById: 'mgr_1',
      },
    }, producer as never);

    expect(prisma.discountRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'drq_1' },
      data: expect.objectContaining({ status: 'APPROVED' }),
    }));
    expect(prisma.quoteRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: 'tenant_1',
        quoteId: 'quote_1',
        version: 2,
        reason: 'discount_request.approved',
        createdById: 'mgr_1',
      }),
    }));
    expect(producer.publish).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'quote.revision_created' }));
  });

  it('routes rejected quote callbacks through CPQ transition authority', async () => {
    const prisma = {
      quote: {
        findFirst: vi.fn(async () => ({
          id: 'quote_1',
          tenantId: 'tenant_1',
          quoteNumber: 'QUO-2026-00001',
          status: 'PENDING_APPROVAL',
          approvalStatus: 'PENDING',
          version: 1,
          total: new Prisma.Decimal(100),
        })),
        update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      },
      quoteRevision: {
        create: vi.fn(async ({ data }) => ({ id: 'rev_2', ...data })),
      },
      outboxMessage: {
        create: vi.fn(async ({ data }) => ({ id: 'outbox_1', ...data })),
      },
    };
    const producer = { publish: vi.fn(async () => undefined) };
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    await handleApprovalRejected(prisma as never, log, {
      tenantId: 'tenant_1',
      payload: {
        entityType: 'quote',
        entityId: 'quote_1',
        recordId: 'approval_1',
        actorId: 'mgr_1',
        comment: 'Pricing rejected',
      },
    }, producer as never);

    expect(prisma.quote.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'quote_1' },
      data: expect.objectContaining({ status: 'REJECTED', approvalStatus: 'REJECTED' }),
    }));
    expect(producer.publish).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ type: 'quote.rejected' }));
  });
});
