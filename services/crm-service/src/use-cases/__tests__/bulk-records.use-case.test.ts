import { describe, expect, it, vi } from 'vitest';
import { createTestEngineContext } from '@nexus/domain-core';
import { createBulkRecordsUseCase } from '../bulk-records.use-case.js';

function makeDeps() {
  const services = {
    contact: { update: vi.fn(), archive: vi.fn() },
    deal: { update: vi.fn(), archive: vi.fn() },
    lead: { update: vi.fn(), archive: vi.fn() },
    account: { update: vi.fn(), archive: vi.fn() },
  };
  const prisma = {
    user: { findFirst: vi.fn() },
    contact: { findMany: vi.fn() },
    deal: { findMany: vi.fn() },
    lead: { findMany: vi.fn() },
    account: { findMany: vi.fn() },
    recordLock: { findFirst: vi.fn().mockResolvedValue(null) },
    orgWideDefault: { findFirst: vi.fn().mockResolvedValue(null) },
    sharingRule: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const producer = { publish: vi.fn() };
  return { services, prisma, producer };
}

describe('bulk records use-case', () => {
  it('rejects hard delete before touching module services', async () => {
    const deps = makeDeps();
    const useCase = createBulkRecordsUseCase(deps as never);
    const ctx = createTestEngineContext();

    await expect(useCase.bulkDelete(ctx, { entityType: 'contact', ids: ['contact_1'], hard: true })).rejects.toMatchObject({
      code: 'UNSUPPORTED_BULK_HARD_DELETE',
    });

    expect(deps.services.contact.archive).not.toHaveBeenCalled();
  });

  it('routes bulk updates through module services and publishes event', async () => {
    const deps = makeDeps();
    const useCase = createBulkRecordsUseCase(deps as never);
    const ctx = createTestEngineContext();

    const result = await useCase.bulkUpdate(ctx, {
      entityType: 'contact',
      ids: ['contact_1', 'contact_2'],
      updates: { ownerId: 'usr_owner', email: 'blocked@example.com' },
    });

    expect(result.updated).toBe(2);
    expect(deps.services.contact.update).toHaveBeenCalledTimes(2);
    expect(deps.services.contact.update).toHaveBeenCalledWith('tenant_test', 'contact_1', { ownerId: 'usr_owner' }, 'usr_test');
    expect(deps.producer.publish).toHaveBeenCalledWith('contact.bulk.updated', expect.objectContaining({ count: 2 }));
  });

  it('requires target user to belong to the tenant for bulk reassign', async () => {
    const deps = makeDeps();
    deps.prisma.user.findFirst.mockResolvedValue(null);
    const useCase = createBulkRecordsUseCase(deps as never);
    const ctx = createTestEngineContext();

    await expect(
      useCase.bulkReassign(ctx, {
        entityType: 'contact',
        ids: ['contact_1'],
        toUserId: 'usr_missing',
      })
    ).rejects.toMatchObject({ code: 'TARGET_USER_NOT_IN_TENANT' });
  });
});
