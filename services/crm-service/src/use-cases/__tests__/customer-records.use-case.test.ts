import { describe, expect, it, vi } from 'vitest';
import { createTestEngineContext } from '@nexus/domain-core';
import { createCustomerRecordsUseCase } from '../customer-records.use-case.js';

function makeDeps() {
  const services = {
    contact: { create: vi.fn(), get: vi.fn(), update: vi.fn(), archive: vi.fn(), restore: vi.fn() },
    account: { create: vi.fn(), get: vi.fn(), update: vi.fn(), archive: vi.fn(), restore: vi.fn() },
  };
  const repositories = {
    contact: { findFirst: vi.fn(), findMany: vi.fn() },
    account: { findFirst: vi.fn(), findMany: vi.fn() },
  };
  const leadRepository = { findMany: vi.fn() };
  const recycle = vi.fn();
  return { services, repositories, leadRepository, recycle };
}

describe('customer records use-case', () => {
  it('mass-updates contacts through the contact service with allowed fields only', async () => {
    const deps = makeDeps();
    const useCase = createCustomerRecordsUseCase(deps);
    const ctx = createTestEngineContext();

    const result = await useCase.massUpdate(ctx, {
      entityType: 'contact',
      ids: ['contact_1', 'contact_2'],
      data: { ownerId: 'usr_owner', email: 'blocked@example.com', tags: ['vip'] },
    });

    expect(result.count).toBe(2);
    expect(deps.services.contact.update).toHaveBeenCalledWith(
      'tenant_test',
      'contact_1',
      { ownerId: 'usr_owner', tags: ['vip'] },
      'usr_test',
      undefined
    );
  });

  it('rejects mass updates with no governed fields', async () => {
    const deps = makeDeps();
    const useCase = createCustomerRecordsUseCase(deps);
    const ctx = createTestEngineContext();

    await expect(
      useCase.massUpdate(ctx, {
        entityType: 'account',
        ids: ['account_1'],
        data: { name: 'Blocked Name Change' },
      })
    ).rejects.toMatchObject({ code: 'NO_VALID_CUSTOMER_MASS_UPDATE_FIELDS' });
  });

  it('mass-archives accounts through account service and sends recycle snapshots', async () => {
    const deps = makeDeps();
    deps.repositories.account.findMany.mockResolvedValue([{ id: 'account_1', name: 'Nova Retail' }]);
    const useCase = createCustomerRecordsUseCase(deps);
    const ctx = createTestEngineContext();

    const result = await useCase.massArchive(ctx, { entityType: 'account', ids: ['account_1'] });

    expect(result.count).toBe(1);
    expect(deps.services.account.archive).toHaveBeenCalledWith('tenant_test', 'account_1');
    expect(deps.recycle).toHaveBeenCalledWith({
      module: 'accounts',
      recordId: 'account_1',
      recordSnapshot: { id: 'account_1', name: 'Nova Retail' },
      deletedBy: 'usr_test',
    });
  });

  it('archives one contact through service and treats recycle as best effort', async () => {
    const deps = makeDeps();
    deps.repositories.contact.findFirst.mockResolvedValue({ id: 'contact_1', firstName: 'Salma' });
    deps.recycle.mockRejectedValue(new Error('recycle unavailable'));
    const useCase = createCustomerRecordsUseCase(deps);
    const ctx = createTestEngineContext();

    const result = await useCase.archive(ctx, { entityType: 'contact', id: 'contact_1' });

    expect(result).toEqual({ id: 'contact_1', deleted: true });
    expect(deps.services.contact.archive).toHaveBeenCalledWith('tenant_test', 'contact_1');
  });

  it('checks person duplicates through repositories', async () => {
    const deps = makeDeps();
    deps.repositories.contact.findMany.mockResolvedValueOnce([
      { id: 'contact_1', firstName: 'Salma', lastName: 'Farid', email: 'salma@example.com' },
    ]);
    const useCase = createCustomerRecordsUseCase(deps);
    const ctx = createTestEngineContext();

    const result = await useCase.checkPersonDuplicates(ctx, { type: 'contact', email: 'salma@example.com' });

    expect(result).toEqual([
      { id: 'contact_1', type: 'CONTACT', name: 'Salma Farid', email: 'salma@example.com', score: 95 },
    ]);
  });

  it('checks account duplicates from governed account signals', async () => {
    const deps = makeDeps();
    deps.services.account.get.mockResolvedValue({
      id: 'account_1',
      name: 'Nova Retail',
      website: 'https://www.nova.example/path',
      email: 'hello@nova.example',
      phone: '+20100000000',
      taxId: 'TAX-1',
      vatNumber: 'VAT-1',
      code: 'ACC-1',
    });
    deps.repositories.account.findMany.mockResolvedValue([{ id: 'account_2', name: 'Nova Retail' }]);
    const useCase = createCustomerRecordsUseCase(deps);
    const ctx = createTestEngineContext();

    const result = await useCase.checkAccountDuplicates(ctx, { accountId: 'account_1' });

    expect(result).toEqual([{ id: 'account_2', name: 'Nova Retail' }]);
    expect(deps.repositories.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant_test',
          id: { not: 'account_1' },
        }),
      })
    );
  });
});
