import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictError, NotFoundError } from '@nexus/service-utils';
import { Prisma } from '../../../../../node_modules/.prisma/crm-client/index.js';
import { createLeadsService } from '../leads.service.js';

vi.mock('../../lib/territory-router.js', () => ({
  assignLeadToTerritory: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../lib/data-quality.js', () => ({
  updateLeadDataQuality: vi.fn().mockResolvedValue(100),
  updateAccountDataQuality: vi.fn().mockResolvedValue(100),
  updateContactDataQuality: vi.fn().mockResolvedValue(100),
  updateDealDataQuality: vi.fn().mockResolvedValue(100),
}));

const TENANT = 'tenant_1';

function makeLead(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'lead_1',
    tenantId: TENANT,
    ownerId: 'user_1',
    firstName: 'Mariam',
    lastName: 'Youssef',
    email: 'mariam@example.com',
    phone: '+201000000000',
    company: 'Nova Trading',
    jobTitle: 'Procurement Manager',
    source: 'WEBSITE',
    rating: 'HOT',
    status: 'NEW',
    score: 60,
    industry: null,
    website: null,
    annualRevenue: null,
    employeeCount: null,
    country: null,
    city: null,
    address: null,
    linkedInUrl: null,
    twitterHandle: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    doNotContact: false,
    gdprConsent: false,
    gdprConsentAt: null,
    customFields: {},
    tags: [] as string[],
    deletedAt: null,
    territoryId: null,
    assignedTo: null,
    dataQualityScore: null,
    convertedAt: null,
    convertedToId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  };
}

function buildPrismaMock() {
  return {
    lead: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    fieldChangeLog: {
      createMany: vi.fn(),
    },
    validationRule: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(),
  };
}

function buildProducerMock() {
  return { publish: vi.fn().mockResolvedValue(undefined) } as unknown as {
    publish: ReturnType<typeof vi.fn>;
  };
}

function makeService() {
  const prisma = buildPrismaMock();
  const producer = buildProducerMock();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createLeadsService(prisma as any, producer as any);
  return { prisma, producer, service };
}

describe('leads service hardening', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService();
  });

  it('rejects duplicate leads by email unless force is enabled', async () => {
    ctx.prisma.lead.findFirst.mockResolvedValueOnce(makeLead());

    await expect(
      ctx.service.createLead(TENANT, {
        firstName: 'Mariam',
        lastName: 'Youssef',
        email: 'mariam@example.com',
        phone: '+201000000000',
        company: 'Nova Trading',
        ownerId: 'user_1',
        source: 'WEBSITE',
        rating: 'HOT',
        customFields: {},
        tags: [],
      } as never)
    ).rejects.toBeInstanceOf(ConflictError);

    ctx.prisma.lead.findFirst.mockReset();
    ctx.prisma.lead.create.mockResolvedValue(makeLead({ id: 'lead_forced' }));

    await ctx.service.createLead(
      TENANT,
      {
        firstName: 'Mariam',
        lastName: 'Youssef',
        email: 'mariam@example.com',
        phone: '+201000000000',
        company: 'Nova Trading',
        ownerId: 'user_1',
        source: 'WEBSITE',
        rating: 'HOT',
        annualRevenue: 2500000,
        customFields: {},
        tags: [],
      } as never,
      true
    );

    expect(ctx.prisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          annualRevenue: expect.any(Prisma.Decimal),
        }),
      })
    );
  });

  it('records field history and publishes lead.updated on update', async () => {
    ctx.prisma.lead.findFirst.mockResolvedValue(makeLead({ status: 'NEW', score: 60 }));
    ctx.prisma.lead.update.mockResolvedValue(makeLead({ status: 'QUALIFIED', score: 82 }));

    const result = await ctx.service.updateLead(
      TENANT,
      'lead_1',
      { status: 'QUALIFIED', score: 82 } as never,
      'user_1',
      'Sales Manager'
    );

    expect(result.status).toBe('QUALIFIED');
    expect(ctx.prisma.fieldChangeLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ objectType: 'lead', fieldName: 'status' }),
          expect.objectContaining({ objectType: 'lead', fieldName: 'score' }),
        ]),
      })
    );
    expect(ctx.producer.publish).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: 'lead.updated',
        tenantId: TENANT,
        payload: expect.objectContaining({
          leadId: 'lead_1',
          changedFields: expect.arrayContaining(['status', 'score']),
        }),
      })
    );
  });

  it('soft archives and restores leads with events', async () => {
    ctx.prisma.lead.findFirst.mockResolvedValue(makeLead());
    ctx.prisma.lead.update.mockResolvedValue(makeLead({ deletedAt: new Date() }));
    ctx.prisma.lead.updateMany.mockResolvedValue({ count: 1 });
    ctx.prisma.lead.findFirstOrThrow.mockResolvedValue(makeLead());

    await ctx.service.deleteLead(TENANT, 'lead_1');
    const restored = await ctx.service.restoreLead(TENANT, 'lead_1');

    expect(restored.id).toBe('lead_1');
    expect(ctx.prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      })
    );
    expect(ctx.producer.publish).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'lead.archived', tenantId: TENANT })
    );
    expect(ctx.producer.publish).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'lead.restored', tenantId: TENANT })
    );
  });

  it('throws NotFoundError when restoring a non-archived or missing lead', async () => {
    ctx.prisma.lead.updateMany.mockResolvedValue({ count: 0 });

    await expect(ctx.service.restoreLead(TENANT, 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});
