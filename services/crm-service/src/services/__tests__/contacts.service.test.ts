import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '@nexus/service-utils';
import { createContactsService } from '../contacts.service.js';

const TENANT = 'tenant_1';

function makeContact(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'contact_1',
    tenantId: TENANT,
    ownerId: 'user_1',
    accountId: 'account_1',
    firstName: 'Salma',
    lastName: 'Farid',
    email: 'salma@example.com',
    phone: null,
    mobile: null,
    jobTitle: 'Head of CX',
    department: 'CX',
    linkedInUrl: null,
    twitterHandle: null,
    country: 'EG',
    city: 'Cairo',
    address: null,
    timezone: 'Africa/Cairo',
    preferredChannel: 'email',
    doNotEmail: false,
    doNotCall: false,
    gdprConsent: true,
    gdprConsentAt: new Date('2026-01-01T00:00:00Z'),
    customFields: {},
    tags: ['Retail'],
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function buildPrismaMock() {
  return {
    account: { findFirst: vi.fn() },
    contact: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
    },
    fieldChangeLog: { createMany: vi.fn() },
  };
}

function buildProducerMock() {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

function makeService() {
  const prisma = buildPrismaMock();
  const producer = buildProducerMock();
  const service = createContactsService(prisma as never, producer as never);
  return { prisma, producer, service };
}

describe('contacts service hardening', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService();
  });

  it('requires contact creation to link to an account in the same tenant', async () => {
    await expect(
      ctx.service.createContact(TENANT, {
        firstName: 'Salma',
        lastName: 'Farid',
        ownerId: 'user_1',
        email: 'salma@example.com',
        customFields: {},
        tags: [],
      } as never)
    ).rejects.toBeInstanceOf(NotFoundError);

    ctx.prisma.account.findFirst.mockResolvedValue(null);

    await expect(
      ctx.service.createContact(TENANT, {
        firstName: 'Salma',
        lastName: 'Farid',
        ownerId: 'user_1',
        accountId: 'missing_account',
        email: 'salma@example.com',
        customFields: {},
        tags: [],
      } as never)
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(ctx.prisma.contact.create).not.toHaveBeenCalled();
  });

  it('prevents duplicate contacts by tenant-scoped email', async () => {
    ctx.prisma.account.findFirst.mockResolvedValue({ id: 'account_1', tenantId: TENANT });
    ctx.prisma.contact.findFirst.mockResolvedValue(makeContact());

    await expect(
      ctx.service.createContact(TENANT, {
        firstName: 'Salma',
        lastName: 'Farid',
        ownerId: 'user_1',
        accountId: 'account_1',
        email: 'salma@example.com',
        customFields: {},
        tags: [],
      } as never)
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('creates primary email records and publishes contact.created', async () => {
    const created = makeContact();
    ctx.prisma.account.findFirst.mockResolvedValue({ id: 'account_1', tenantId: TENANT });
    ctx.prisma.contact.findFirst.mockResolvedValue(null);
    ctx.prisma.contact.create.mockResolvedValue(created);
    ctx.prisma.contact.findUnique.mockResolvedValue(created);
    ctx.prisma.contact.update.mockResolvedValue(created);

    await ctx.service.createContact(TENANT, {
      firstName: 'Salma',
      lastName: 'Farid',
      ownerId: 'user_1',
      accountId: 'account_1',
      email: 'salma@example.com',
      customFields: {},
      tags: [],
    } as never);

    expect(ctx.prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'account_1',
          emails: {
            create: [expect.objectContaining({ email: 'salma@example.com', isPrimary: true })],
          },
        }),
      })
    );
    expect(ctx.producer.publish).toHaveBeenCalledWith(
      expect.stringContaining('contacts'),
      expect.objectContaining({
        type: 'contact.created',
        tenantId: TENANT,
        payload: expect.objectContaining({ contactId: 'contact_1', accountId: 'account_1' }),
      })
    );
  });

  it('records account reassignment, consent changes, and publishes contact.updated', async () => {
    const existing = makeContact({ accountId: 'account_1', gdprConsent: false, gdprConsentAt: null });
    const updated = makeContact({ accountId: 'account_2', gdprConsent: true });
    ctx.prisma.contact.findFirst.mockResolvedValue(existing);
    ctx.prisma.account.findFirst.mockResolvedValue({ id: 'account_2', tenantId: TENANT });
    ctx.prisma.contact.update.mockResolvedValue(updated);
    ctx.prisma.contact.findUnique.mockResolvedValue(updated);

    await ctx.service.updateContact(
      TENANT,
      'contact_1',
      { accountId: 'account_2', gdprConsent: true } as never,
      'user_1',
      'Sara Manager'
    );

    expect(ctx.prisma.fieldChangeLog.createMany).toHaveBeenCalled();
    expect(ctx.producer.publish).toHaveBeenCalledWith(
      expect.stringContaining('contacts'),
      expect.objectContaining({
        type: 'contact.updated',
        payload: expect.objectContaining({
          contactId: 'contact_1',
          accountId: 'account_2',
          changedFields: expect.arrayContaining(['accountId', 'gdprConsent']),
        }),
      })
    );
  });

  it('publishes contact.archived and contact.restored for lifecycle governance', async () => {
    const archived = makeContact({ deletedAt: new Date('2026-02-01T00:00:00Z'), isActive: false });
    ctx.prisma.contact.findFirst.mockResolvedValue(makeContact());
    ctx.prisma.contact.update.mockResolvedValue(archived);
    ctx.prisma.contact.updateMany.mockResolvedValue({ count: 1 });
    ctx.prisma.contact.findFirstOrThrow.mockResolvedValue(makeContact());

    await ctx.service.deleteContact(TENANT, 'contact_1');
    await ctx.service.restoreContact(TENANT, 'contact_1');

    expect(ctx.prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          isActive: false,
        }),
      })
    );
    expect(ctx.producer.publish).toHaveBeenCalledWith(
      expect.stringContaining('contacts'),
      expect.objectContaining({ type: 'contact.archived', tenantId: TENANT })
    );
    expect(ctx.producer.publish).toHaveBeenCalledWith(
      expect.stringContaining('contacts'),
      expect.objectContaining({ type: 'contact.restored', tenantId: TENANT })
    );
  });
});
