import { describe, expect, it, vi } from 'vitest';
import { projectFinanceQuoteEvent } from './quote-projection.consumer.js';

describe('quote projection event ordering', () => {
  it('does not regress a quote when its create arrives after a newer update', async () => {
    // Catches late create events overwriting a newer lifecycle state in the read model.
    let projection: Record<string, unknown> | null = null;
    const processedEvents = new Set<string>();
    const prisma = {
      quoteProjection: {
        findFirst: vi.fn(async () => projection),
        // Models the real Prisma `updateMany` filter semantics the consumer
        // relies on for its version guard: the write applies only when the
        // stored row matches the `where`, and the returned count reports
        // whether it did. Without this the fake silently lacked the method the
        // production code calls.
        updateMany: vi.fn(async ({ where, data }: {
          where: { sourceEventVersion?: { lte?: number } };
          data: Record<string, unknown>;
        }) => {
          if (!projection) return { count: 0 };
          const incomingAtLeastAsNew =
            where.sourceEventVersion?.lte === undefined ||
            Number(projection.sourceEventVersion ?? 0) <= where.sourceEventVersion.lte;
          if (!incomingAtLeastAsNew) return { count: 0 };
          projection = { ...projection, ...data };
          return { count: 1 };
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          projection = { id: 'projection-1', ...data };
          return projection;
        }),
        upsert: vi.fn(async ({ create, update }: {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          projection = projection
            ? { ...projection, ...update }
            : { id: 'projection-1', ...create };
          return projection;
        }),
      },
      quoteProjectionEvent: {
        findFirst: vi.fn(async ({ where }: {
          where: { sourceEventId: string };
        }) => processedEvents.has(where.sourceEventId)
          ? { sourceEventId: where.sourceEventId }
          : null),
        create: vi.fn(async ({ data }: {
          data: { sourceEventId: string };
        }) => {
          processedEvents.add(data.sourceEventId);
          return data;
        }),
      },
    };

    await projectFinanceQuoteEvent(prisma as never, {
      id: 'quote-event-v2',
      type: 'quote.sent',
      tenantId: 'tenant-a',
      version: 2,
      payload: {
        quoteId: 'quote-1',
        status: 'SENT',
        total: 125,
        currency: 'USD',
      },
    });
    await projectFinanceQuoteEvent(prisma as never, {
      id: 'quote-event-v1',
      type: 'quote.created',
      tenantId: 'tenant-a',
      version: 1,
      payload: {
        quoteId: 'quote-1',
        status: 'DRAFT',
        total: 125,
        currency: 'USD',
      },
    });

    expect(processedEvents).toEqual(new Set(['quote-event-v2', 'quote-event-v1']));
    expect(projection).toEqual(expect.objectContaining({
      quoteId: 'quote-1',
      status: 'SENT',
      sourceEventVersion: 2,
      lastFinanceEventType: 'quote.sent',
    }));
  });
});
