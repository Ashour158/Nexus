import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TenantContextError,
  createTenantPrismaExtension,
} from '../prisma-tenant.js';
import { getTenantId, runWithTenant } from '../request-context.js';
import {
  applyOwnershipScope,
  requirePermission,
  resolveRecordScope,
  type RecordScope,
} from '../rbac.js';

type TenantOperation = (input: {
  model: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}) => Promise<unknown>;

function tenantOperation(
  extension: ReturnType<typeof createTenantPrismaExtension>
): TenantOperation {
  return extension.query.$allModels.$allOperations;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tenant isolation boundary', () => {
  it('fails closed when a tenant-scoped query has no ALS tenant', async () => {
    // Catches missing request/consumer context silently becoming an unscoped query.
    const query = vi.fn(async () => [{ id: 'tenant-b-secret' }]);
    const operation = tenantOperation(
      createTenantPrismaExtension({}, { getTenantId, failClosed: true })
    );

    await expect(operation({
      model: 'Deal',
      operation: 'findMany',
      args: {},
      query,
    })).rejects.toBeInstanceOf(TenantContextError);
    expect(query).not.toHaveBeenCalled();
  });

  it('prevents tenant A from reading or writing tenant B rows', async () => {
    // Catches caller-supplied tenant filters overriding the authenticated ALS tenant.
    const rows = [
      { id: 'deal-a', tenantId: 'tenant-a', name: 'A original' },
      { id: 'deal-b', tenantId: 'tenant-b', name: 'B secret' },
    ];
    const operation = tenantOperation(
      createTenantPrismaExtension({}, { getTenantId, failClosed: true })
    );
    const read = vi.fn(async (rawArgs: unknown) => {
      const args = rawArgs as { where: { tenantId: string } };
      return rows.filter((row) => row.tenantId === args.where.tenantId);
    });
    const write = vi.fn(async (rawArgs: unknown) => {
      const args = rawArgs as {
        where: { id: string; tenantId: string };
        data: { name: string };
      };
      const target = rows.find(
        (row) =>
          row.id === args.where.id &&
          row.tenantId === args.where.tenantId
      );
      if (target) target.name = args.data.name;
      return { count: target ? 1 : 0 };
    });

    const visible = await runWithTenant('tenant-a', () =>
      operation({
        model: 'Deal',
        operation: 'findMany',
        args: { where: { tenantId: 'tenant-b' } },
        query: read,
      })
    );
    const attemptedCrossTenantWrite = await runWithTenant('tenant-a', () =>
      operation({
        model: 'Deal',
        operation: 'updateMany',
        args: {
          where: { id: 'deal-b', tenantId: 'tenant-b' },
          data: { name: 'stolen' },
        },
        query: write,
      })
    );

    expect(visible).toEqual([{ id: 'deal-a', tenantId: 'tenant-a', name: 'A original' }]);
    expect(attemptedCrossTenantWrite).toEqual({ count: 0 });
    expect(rows).toEqual([
      { id: 'deal-a', tenantId: 'tenant-a', name: 'A original' },
      { id: 'deal-b', tenantId: 'tenant-b', name: 'B secret' },
    ]);
    expect(read).toHaveBeenCalledWith({ where: { tenantId: 'tenant-a' } });
    expect(write).toHaveBeenCalledWith({
      where: { id: 'deal-b', tenantId: 'tenant-a' },
      data: { name: 'stolen' },
    });
  });
});

describe('RBAC denial boundary', () => {
  it('returns 403 and a FORBIDDEN denial when the permission is absent', async () => {
    // Catches permission middleware returning a successful-looking response to a denied user.
    let statusCode = 0;
    let responseBody: unknown;
    const reply = {
      code: vi.fn((code: number) => {
        statusCode = code;
        return reply;
      }),
      send: vi.fn((body: unknown) => {
        responseBody = body;
        return body;
      }),
    };
    const request = {
      id: 'request-1',
      user: {
        sub: 'rep-1',
        tenantId: 'tenant-a',
        roles: ['SALES_REP'],
        permissions: ['deals:read:own'],
      },
    };

    await requirePermission('deals:update')(request as never, reply as never);

    expect(statusCode).toBe(403);
    expect(responseBody).toEqual({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Permission required: deals:update',
        requestId: 'request-1',
      },
    });
    expect(reply.send).toHaveBeenCalledTimes(1);
  });
});

describe('ownership-scoped row visibility', () => {
  const rows = [
    { id: 'deal-rep', ownerId: 'rep-1' },
    { id: 'deal-peer', ownerId: 'rep-2' },
    { id: 'deal-outsider', ownerId: 'rep-3' },
  ];

  function visibleIds(
    permissions: string[],
    teamMemberIds: string[] = []
  ): string[] {
    const scope = resolveRecordScope(permissions, 'deals:read');
    const where = applyOwnershipScope(scope, {
      userId: 'rep-1',
      teamMemberIds,
    });
    const owner = where.ownerId as string | { in: string[] } | undefined;
    return rows
      .filter((row) => {
        if (owner === undefined) return true;
        if (typeof owner === 'string') return row.ownerId === owner;
        return owner.in.includes(row.ownerId);
      })
      .map((row) => row.id);
  }

  it('returns distinct own, team, and all row sets without exposing a peer under own', () => {
    // Catches scoped grants opening the gate but forgetting to constrain the query rows.
    const cases: Array<{
      scope: RecordScope;
      permissions: string[];
      team: string[];
      expected: string[];
    }> = [
      {
        scope: 'own',
        permissions: ['deals:read:own'],
        team: ['rep-1', 'rep-2'],
        expected: ['deal-rep'],
      },
      {
        scope: 'team',
        permissions: ['deals:read:team'],
        team: ['rep-1', 'rep-2'],
        expected: ['deal-rep', 'deal-peer'],
      },
      {
        scope: 'all',
        permissions: ['deals:read:all'],
        team: ['rep-1', 'rep-2'],
        expected: ['deal-rep', 'deal-peer', 'deal-outsider'],
      },
    ];

    for (const testCase of cases) {
      expect(resolveRecordScope(testCase.permissions, 'deals:read')).toBe(testCase.scope);
      expect(visibleIds(testCase.permissions, testCase.team)).toEqual(testCase.expected);
    }
    expect(visibleIds(['deals:read:own'], ['rep-1', 'rep-2'])).not.toContain('deal-peer');
  });
});
