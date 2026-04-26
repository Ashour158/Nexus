import { describe, expect, it, vi } from 'vitest';
import { createSubscriptionsService } from '../services/subscriptions.service.js';

describe('createSubscriptionsService', () => {
  it('updateSubscription rejects unknown planId', async () => {
    const subscriptionRow = {
      id: 'sub1',
      tenantId: 't1',
      planId: 'plan-old',
      status: 'ACTIVE' as const,
      version: 1,
    };
    const prisma = {
      subscription: {
        findFirst: vi.fn().mockResolvedValue({ ...subscriptionRow, plan: { id: 'plan-old' } }),
        update: vi.fn(),
      },
      plan: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const producer = { publish: vi.fn() } as never;
    const svc = createSubscriptionsService(prisma as never, producer);

    await expect(svc.updateSubscription('t1', { planId: 'missing-plan' })).rejects.toThrow();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });

  it('updateSubscription persists plan and seats when plan exists', async () => {
    const subscriptionRow = {
      id: 'sub1',
      tenantId: 't1',
      planId: 'plan-a',
      status: 'ACTIVE' as const,
      version: 1,
    };
    const prisma = {
      subscription: {
        findFirst: vi.fn().mockResolvedValue({ ...subscriptionRow, plan: { id: 'plan-a' } }),
        update: vi.fn().mockResolvedValue({ ...subscriptionRow, planId: 'plan-b', seats: 5, version: 2 }),
      },
      plan: {
        findFirst: vi.fn().mockResolvedValue({ id: 'plan-b', isActive: true }),
      },
    };
    const producer = { publish: vi.fn() } as never;
    const svc = createSubscriptionsService(prisma as never, producer);

    const out = await svc.updateSubscription('t1', { planId: 'plan-b', seats: 5 });
    expect(out.seats).toBe(5);
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          plan: { connect: { id: 'plan-b' } },
          seats: 5,
        }),
      })
    );
  });
});
