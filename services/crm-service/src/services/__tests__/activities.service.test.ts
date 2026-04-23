import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BusinessRuleError, NotFoundError } from '@nexus/service-utils';
import { createActivitiesService } from '../activities.service.js';

const TENANT = 'tenant_1';

function makePrisma() {
  return {
    deal: { findFirst: vi.fn(async () => ({ id: 'deal_1' })) },
    contact: { findFirst: vi.fn(async () => null) },
    lead: { findFirst: vi.fn(async () => null) },
    account: { findFirst: vi.fn(async () => null) },
    activity: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'act_1',
        ...data,
        status: 'PLANNED',
        completedAt: null,
      })),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === 'missing') return null;
        if (where.id === 'done') return { id: 'done', status: 'COMPLETED' };
        if (where.id === 'cancelled') return { id: 'cancelled', status: 'CANCELLED' };
        return {
          id: where.id,
          tenantId: TENANT,
          ownerId: 'u1',
          type: 'TASK',
          status: 'PLANNED',
          dealId: 'deal_1',
          completedAt: null,
        };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: where.id,
        tenantId: TENANT,
        ownerId: 'u1',
        type: 'TASK',
        status: data.status ?? 'COMPLETED',
        dealId: 'deal_1',
        completedAt: data.completedAt ?? new Date(),
        outcome: data.outcome,
      })),
      findMany: vi.fn(async () => [
        { id: 'a1', status: 'PLANNED', dueDate: new Date(Date.now() + 3600_000) },
        { id: 'a2', status: 'PLANNED', dueDate: new Date(Date.now() + 2 * 3600_000) },
      ]),
      count: vi.fn(async () => 2),
    },
  };
}

function makeProducer() {
  return { publish: vi.fn(async () => undefined) };
}

describe('createActivity', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let producer: ReturnType<typeof makeProducer>;
  let svc: ReturnType<typeof createActivitiesService>;

  beforeEach(() => {
    prisma = makePrisma();
    producer = makeProducer();
    svc = createActivitiesService(prisma as never, producer as never);
  });

  it('validates dealId belongs to tenant — throws NotFoundError if not', async () => {
    prisma.deal.findFirst = vi.fn(async () => null) as never;
    await expect(
      svc.createActivity(TENANT, {
        type: 'TASK',
        subject: 'x',
        ownerId: 'u1',
        dealId: 'deal_404',
        priority: 'NORMAL',
        customFields: {},
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('publishes activity.created event with correct payload', async () => {
    await svc.createActivity(TENANT, {
      type: 'TASK',
      subject: 'Follow up',
      ownerId: 'u1',
      dealId: 'deal_1',
      priority: 'NORMAL',
      customFields: {},
    });
    expect(producer.publish).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: 'activity.created',
        tenantId: TENANT,
        payload: expect.objectContaining({ dealId: 'deal_1' }),
      })
    );
  });

  it('stores dueDate as Date object', async () => {
    await svc.createActivity(TENANT, {
      type: 'TASK',
      subject: 'Due soon',
      ownerId: 'u1',
      dealId: 'deal_1',
      dueDate: '2026-12-01T00:00:00.000Z',
      priority: 'NORMAL',
      customFields: {},
    });
    expect(prisma.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dueDate: expect.any(Date) }),
      })
    );
  });
});

describe('completeActivity', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let producer: ReturnType<typeof makeProducer>;
  let svc: ReturnType<typeof createActivitiesService>;

  beforeEach(() => {
    prisma = makePrisma();
    producer = makeProducer();
    svc = createActivitiesService(prisma as never, producer as never);
  });

  it('throws BusinessRuleError when already DONE', async () => {
    await expect(svc.completeActivity(TENANT, 'done', 'ok')).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('throws BusinessRuleError when CANCELLED', async () => {
    await expect(svc.completeActivity(TENANT, 'cancelled', 'ok')).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('sets completedAt to now and stores outcome', async () => {
    const res = await svc.completeActivity(TENANT, 'act_1', 'Completed successfully');
    expect((res as { completedAt?: Date | null }).completedAt).toBeTruthy();
    expect((res as { outcome?: string }).outcome).toBe('Completed successfully');
  });

  it('publishes activity.completed with dealId in payload', async () => {
    await svc.completeActivity(TENANT, 'act_1', 'Done');
    expect(producer.publish).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: 'activity.completed',
        payload: expect.objectContaining({ dealId: 'deal_1' }),
      })
    );
  });
});

describe('getUpcomingActivities', () => {
  it('returns only OPEN activities due within daysAhead window', async () => {
    const prisma = makePrisma();
    const svc = createActivitiesService(prisma as never, makeProducer() as never);
    const res = await svc.getUpcomingActivities(TENANT, 'u1', 7);
    expect(res.every((a) => (a as { status: string }).status === 'PLANNED')).toBe(true);
  });

  it('orders by dueDate asc', async () => {
    const prisma = makePrisma();
    const svc = createActivitiesService(prisma as never, makeProducer() as never);
    await svc.getUpcomingActivities(TENANT, 'u1', 7);
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { dueDate: 'asc' } })
    );
  });
});
