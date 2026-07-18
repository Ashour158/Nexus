import { describe, it, expect } from 'vitest';
import {
  flattenCompoundUniqueWhere,
  mergeWhere,
  applyTenantArgs,
  runCrossTenant,
  isCrossTenant,
} from '../prisma-tenant.js';

/**
 * These cover the failure that silently disabled notification-service: the
 * extension remaps findUnique → findFirst, and findFirst cannot parse Prisma's
 * compound-unique shorthand (`tenantId_dedupKey: {...}`). Every such lookup threw
 * `Unknown argument`, retried 3x, and was dropped — with the service reporting
 * healthy the whole time.
 */
describe('flattenCompoundUniqueWhere', () => {
  it('expands a compound-unique key into its component fields', () => {
    const out = flattenCompoundUniqueWhere({
      tenantId_dedupKey: { tenantId: 't1', dedupKey: 'evt:user:type' },
    });
    expect(out).toEqual({ tenantId: 't1', dedupKey: 'evt:user:type' });
    expect(out).not.toHaveProperty('tenantId_dedupKey');
  });

  it('expands three-part compound keys', () => {
    const out = flattenCompoundUniqueWhere({
      tenantId_userId_channel: { tenantId: 't1', userId: 'u1', channel: 'IN_APP' },
    });
    expect(out).toEqual({ tenantId: 't1', userId: 'u1', channel: 'IN_APP' });
  });

  it('leaves plain scalar filters untouched', () => {
    const where = { id: 'x', status: 'DRAFT' };
    expect(flattenCompoundUniqueWhere(where)).toEqual(where);
  });

  it('does NOT flatten a field that merely contains an underscore', () => {
    // A JSON column named `meta_data` holding a nested filter must survive: its
    // inner keys do not reconstruct the field name, so it is not compound-unique.
    const where = { meta_data: { path: ['a'], equals: 1 } };
    expect(flattenCompoundUniqueWhere(where)).toEqual(where);
  });

  it('does not treat arrays as compound keys', () => {
    const where = { AND: [{ a: 1 }, { b: 2 }] };
    expect(flattenCompoundUniqueWhere(where)).toEqual(where);
  });

  it('tolerates null values', () => {
    const where = { dedupKey: null };
    expect(flattenCompoundUniqueWhere(where)).toEqual(where);
  });
});

describe('mergeWhere', () => {
  it('flattens a compound-unique where AND scopes it to the tenant', () => {
    const merged = mergeWhere(
      { where: { tenantId_dedupKey: { tenantId: 't1', dedupKey: 'k' } }, select: { id: true } },
      't1'
    );
    // The shape findFirst can actually execute.
    expect(merged.where).toEqual({ tenantId: 't1', dedupKey: 'k' });
    // Non-where args are preserved.
    expect(merged.select).toEqual({ id: true });
  });

  it('always wins on tenantId, even if the caller passed a different one', () => {
    const merged = mergeWhere({ where: { tenantId_dedupKey: { tenantId: 'attacker', dedupKey: 'k' } } }, 'real');
    expect((merged.where as Record<string, unknown>).tenantId).toBe('real');
  });

  it('injects tenantId when there is no where at all', () => {
    expect(mergeWhere({}, 't1').where).toEqual({ tenantId: 't1' });
  });
});

/**
 * The escape hatch is the ONLY way to run unscoped once enforcement is on, so it
 * has to be hard to reach by accident and impossible to reach silently.
 */
describe('runCrossTenant', () => {
  it('marks the call stack as cross-tenant, and only inside the callback', async () => {
    expect(isCrossTenant()).toBe(false);
    await runCrossTenant('rotten-deal sweep spans all tenants', async () => {
      expect(isCrossTenant()).toBe(true);
    });
    expect(isCrossTenant()).toBe(false);
  });

  it('does not leak across sibling async work', async () => {
    const inside = runCrossTenant('sweep', async () => {
      await new Promise((r) => setTimeout(r, 5));
      return isCrossTenant();
    });
    // Concurrent work started outside the wrapper must NOT inherit the flag.
    const outside = (async () => {
      await new Promise((r) => setTimeout(r, 1));
      return isCrossTenant();
    })();
    expect(await inside).toBe(true);
    expect(await outside).toBe(false);
  });

  it('clears the flag even when the callback throws', async () => {
    await expect(
      runCrossTenant('sweep', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(isCrossTenant()).toBe(false);
  });

  it('REQUIRES a reason — it is an audit record, not a flag', () => {
    expect(() => runCrossTenant('', async () => undefined)).toThrow(/non-empty reason/);
    expect(() => runCrossTenant('   ', async () => undefined)).toThrow(/non-empty reason/);
  });

  it('returns the callback result', async () => {
    await expect(runCrossTenant('sweep', async () => 42)).resolves.toBe(42);
  });
});

describe('applyTenantArgs', () => {
  it('scopes reads to the tenant', () => {
    const out = applyTenantArgs('findMany', { where: { status: 'OPEN' } }, 't1');
    expect(out.where).toEqual({ status: 'OPEN', tenantId: 't1' });
  });

  it('stamps tenantId on create', () => {
    const out = applyTenantArgs('create', { data: { name: 'x' } }, 't1');
    expect(out.data).toEqual({ name: 'x', tenantId: 't1' });
  });

  it('stamps tenantId on every row of createMany', () => {
    const out = applyTenantArgs('createMany', { data: [{ name: 'a' }, { name: 'b' }] }, 't1');
    expect(out.data).toEqual([
      { name: 'a', tenantId: 't1' },
      { name: 'b', tenantId: 't1' },
    ]);
  });

  it('scopes both the where and the create branch of an upsert', () => {
    const out = applyTenantArgs('upsert', { where: { id: '1' }, create: { name: 'x' }, update: {} }, 't1');
    expect(out.where).toEqual({ id: '1', tenantId: 't1' });
    expect(out.create).toEqual({ name: 'x', tenantId: 't1' });
  });
});
