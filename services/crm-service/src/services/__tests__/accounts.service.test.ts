import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessRuleError } from '@nexus/service-utils';
import { createAccountsService } from '../accounts.service.js';

const TENANT = 'tenant_1';

function makeAccount(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'account_1',
    tenantId: TENANT,
    ownerId: 'user_1',
    parentAccountId: null,
    code: 'ACC-2026-000001',
    name: 'Nova Retail',
    legalName: 'Nova Retail Group',
    tradeName: 'Nova',
    website: 'https://nova.example',
    phone: '+20 100 000 0000',
    fax: null,
    email: 'procurement@nova.example',
    industry: 'Retail',
    subIndustry: 'Omnichannel',
    type: 'CUSTOMER',
    tier: 'MID_MARKET',
    status: 'ACTIVE',
    lifecycleStage: 'Expansion',
    annualRevenue: null,
    employeeCount: 340,
    foundedYear: 2016,
    country: 'EG',
    city: 'Cairo',
    address: 'New Cairo',
    zipCode: '11835',
    linkedInUrl: null,
    description: null,
    sicCode: null,
    naicsCode: null,
    taxId: 'EG-TAX-1',
    vatNumber: 'EG-VAT-1',
    commercialRegistrationNumber: 'CR-1',
    paymentTerms: 'Net 30',
    creditLimit: null,
    currency: 'USD',
    priceBookId: null,
    territoryId: null,
    healthScore: 80,
    npsScore: null,
    riskLevel: 'LOW',
    lastActivityAt: null,
    billingAddressLine1: 'HQ',
    billingAddressLine2: null,
    billingCity: 'Cairo',
    billingState: null,
    billingPostalCode: '11835',
    billingCountry: 'EG',
    billingLatitude: null,
    billingLongitude: null,
    shippingAddressLine1: 'DC',
    shippingAddressLine2: null,
    shippingCity: 'Cairo',
    shippingState: null,
    shippingPostalCode: '11828',
    shippingCountry: 'EG',
    shippingLatitude: null,
    shippingLongitude: null,
    shippingInstructions: null,
    sameAsBilling: false,
    customFields: {},
    tags: ['retail'],
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function buildPrismaMock() {
  return {
    account: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
    },
    contact: { count: vi.fn() },
    deal: { count: vi.fn() },
    fieldChangeLog: { createMany: vi.fn() },
  };
}

function buildProducerMock() {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

function makeService() {
  const prisma = buildPrismaMock();
  const producer = buildProducerMock();
  const service = createAccountsService(prisma as never, producer as never);
  return { prisma, producer, service };
}

describe('accounts service hardening', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService();
  });

  it('persists deep account master data and publishes account.created', async () => {
    const account = makeAccount();
    ctx.prisma.account.create.mockResolvedValue(account);
    ctx.prisma.account.findUnique.mockResolvedValue(account);
    ctx.prisma.account.update.mockResolvedValue(account);

    await ctx.service.createAccount(TENANT, {
      ownerId: 'user_1',
      code: 'ACC-2026-000001',
      name: 'Nova Retail',
      legalName: 'Nova Retail Group',
      website: 'https://nova.example',
      email: 'procurement@nova.example',
      phone: '+20 100 000 0000',
      industry: 'Retail',
      subIndustry: 'Omnichannel',
      type: 'CUSTOMER',
      tier: 'MID_MARKET',
      status: 'ACTIVE',
      lifecycleStage: 'Expansion',
      employeeCount: 340,
      taxId: 'EG-TAX-1',
      vatNumber: 'EG-VAT-1',
      commercialRegistrationNumber: 'CR-1',
      paymentTerms: 'Net 30',
      currency: 'USD',
      billingAddressLine1: 'HQ',
      billingCity: 'Cairo',
      billingCountry: 'EG',
      shippingAddressLine1: 'DC',
      shippingCity: 'Cairo',
      shippingCountry: 'EG',
      customFields: {},
      tags: ['retail'],
    } as never);

    expect(ctx.prisma.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'ACC-2026-000001',
          legalName: 'Nova Retail Group',
          subIndustry: 'Omnichannel',
          taxId: 'EG-TAX-1',
          vatNumber: 'EG-VAT-1',
          commercialRegistrationNumber: 'CR-1',
          billingAddressLine1: 'HQ',
          shippingAddressLine1: 'DC',
        }),
      })
    );
    expect(ctx.producer.publish).toHaveBeenCalledWith(
      expect.stringContaining('accounts'),
      expect.objectContaining({
        type: 'account.created',
        tenantId: TENANT,
        payload: expect.objectContaining({ accountId: 'account_1', name: 'Nova Retail' }),
      })
    );
  });

  it('tracks governed changes and publishes account.updated', async () => {
    const existing = makeAccount({ riskLevel: 'LOW', billingCity: 'Cairo' });
    const updated = makeAccount({ riskLevel: 'HIGH', billingCity: 'Giza' });
    ctx.prisma.account.findFirst.mockResolvedValue(existing);
    ctx.prisma.account.update.mockResolvedValue(updated);
    ctx.prisma.account.findUnique.mockResolvedValue(updated);

    await ctx.service.updateAccount(
      TENANT,
      'account_1',
      { riskLevel: 'HIGH', billingCity: 'Giza' } as never,
      'user_1',
      'Sara Manager'
    );

    expect(ctx.prisma.fieldChangeLog.createMany).toHaveBeenCalled();
    expect(ctx.producer.publish).toHaveBeenCalledWith(
      expect.stringContaining('accounts'),
      expect.objectContaining({
        type: 'account.updated',
        payload: expect.objectContaining({
          accountId: 'account_1',
          changedFields: expect.arrayContaining(['riskLevel', 'billingCity']),
        }),
      })
    );
  });

  it('blocks account archive when open deals or active contacts are still linked', async () => {
    ctx.prisma.account.findFirst.mockResolvedValue(makeAccount());
    ctx.prisma.deal.count.mockResolvedValueOnce(1);
    ctx.prisma.contact.count.mockResolvedValueOnce(0);

    await expect(ctx.service.deleteAccount(TENANT, 'account_1')).rejects.toBeInstanceOf(BusinessRuleError);

    ctx.prisma.deal.count.mockResolvedValueOnce(0);
    ctx.prisma.contact.count.mockResolvedValueOnce(2);

    await expect(ctx.service.deleteAccount(TENANT, 'account_1')).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('publishes account.archived and account.restored when lifecycle changes', async () => {
    ctx.prisma.account.findFirst.mockResolvedValue(makeAccount());
    ctx.prisma.deal.count.mockResolvedValue(0);
    ctx.prisma.contact.count.mockResolvedValue(0);
    ctx.prisma.account.update.mockResolvedValue(makeAccount({ deletedAt: new Date('2026-02-01T00:00:00Z') }));
    ctx.prisma.account.updateMany.mockResolvedValue({ count: 1 });
    ctx.prisma.account.findFirstOrThrow.mockResolvedValue(makeAccount());

    await ctx.service.deleteAccount(TENANT, 'account_1');
    await ctx.service.restoreAccount(TENANT, 'account_1');

    expect(ctx.producer.publish).toHaveBeenCalledWith(
      expect.stringContaining('accounts'),
      expect.objectContaining({ type: 'account.archived', tenantId: TENANT })
    );
    expect(ctx.producer.publish).toHaveBeenCalledWith(
      expect.stringContaining('accounts'),
      expect.objectContaining({ type: 'account.restored', tenantId: TENANT })
    );
  });
});
