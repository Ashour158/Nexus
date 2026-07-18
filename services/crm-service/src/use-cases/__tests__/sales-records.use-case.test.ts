import { describe, expect, it, vi } from 'vitest';
import { createTestEngineContext } from '@nexus/domain-core';
import { createSalesRecordsUseCase } from '../sales-records.use-case.js';

function makeDeps() {
  const leads = {
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    convert: vi.fn(),
    findDuplicates: vi.fn(),
  };
  const deals = {
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    moveStage: vi.fn(),
    markWon: vi.fn(),
    markLost: vi.fn(),
  };
  const repositories = {
    lead: { findFirst: vi.fn(), findMany: vi.fn() },
    deal: { findFirst: vi.fn(), findMany: vi.fn() },
  };
  const recycle = vi.fn();
  return { leads, deals, repositories, recycle };
}

describe('sales records use-case', () => {
  it('mass-updates leads through lead service with allowed fields only', async () => {
    const deps = makeDeps();
    const useCase = createSalesRecordsUseCase(deps);
    const ctx = createTestEngineContext();

    const result = await useCase.massUpdate(ctx, {
      entityType: 'lead',
      ids: ['lead_1', 'lead_2'],
      data: { ownerId: 'usr_owner', email: 'blocked@example.com', status: 'WORKING' },
    });

    expect(result.count).toBe(2);
    expect(deps.leads.update).toHaveBeenCalledWith(
      'tenant_test',
      'lead_1',
      { ownerId: 'usr_owner', status: 'WORKING' },
      'usr_test',
      undefined,
      ['admin']
    );
  });

  it('rejects mass updates with no governed fields', async () => {
    const deps = makeDeps();
    const useCase = createSalesRecordsUseCase(deps);
    const ctx = createTestEngineContext();

    await expect(useCase.massUpdate(ctx, {
      entityType: 'deal',
      ids: ['deal_1'],
      data: { name: 'Blocked' },
    })).rejects.toMatchObject({ code: 'NO_VALID_SALES_MASS_UPDATE_FIELDS' });
  });

  it('archives deal rows through service and sends best-effort recycle snapshots', async () => {
    const deps = makeDeps();
    deps.repositories.deal.findMany.mockResolvedValue([{ id: 'deal_1', name: 'Expansion' }]);
    deps.recycle.mockRejectedValue(new Error('recycle offline'));
    const useCase = createSalesRecordsUseCase(deps);
    const ctx = createTestEngineContext();

    const result = await useCase.massArchive(ctx, { entityType: 'deal', ids: ['deal_1'] });

    expect(result.count).toBe(1);
    expect(deps.deals.archive).toHaveBeenCalledWith(
      'tenant_test',
      'deal_1',
      'usr_test',
      undefined
    );
    expect(deps.recycle).toHaveBeenCalled();
  });

  it('routes lead conversion and duplicate checks through lead service', async () => {
    const deps = makeDeps();
    deps.leads.get.mockResolvedValue({ id: 'lead_1', email: 'lead@example.com', firstName: 'Mariam', lastName: 'Youssef', company: 'Nova' });
    deps.leads.findDuplicates.mockResolvedValue([{ id: 'lead_1' }, { id: 'lead_2' }]);
    const useCase = createSalesRecordsUseCase(deps);
    const ctx = createTestEngineContext();

    await useCase.convertLead(ctx, { leadId: 'lead_1', data: { createDeal: false } });
    const duplicates = await useCase.checkLeadDuplicates(ctx, { leadId: 'lead_1' });

    expect(deps.leads.convert).toHaveBeenCalledWith('tenant_test', 'lead_1', { createDeal: false });
    expect(duplicates).toEqual([{ id: 'lead_2' }]);
  });

  it('routes deal stage and win/loss transitions through deal service', async () => {
    const deps = makeDeps();
    const useCase = createSalesRecordsUseCase(deps);
    const ctx = createTestEngineContext();

    await useCase.moveDealStage(ctx, { dealId: 'deal_1', stageId: 'stage_2' });
    await useCase.markDealWon(ctx, { dealId: 'deal_1' });
    await useCase.markDealLost(ctx, { dealId: 'deal_2', reason: 'PRICE', detail: 'Too high' });

    expect(deps.deals.moveStage).toHaveBeenCalledWith('tenant_test', 'deal_1', 'stage_2');
    expect(deps.deals.markWon).toHaveBeenCalledWith('tenant_test', 'deal_1');
    expect(deps.deals.markLost).toHaveBeenCalledWith('tenant_test', 'deal_2', 'PRICE', 'Too high');
  });
});
