import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BusinessRuleError } from '@nexus/service-utils';
import { handleActionNode } from '../nodes/action.node.js';
import { handleConditionNode } from '../nodes/condition.node.js';
import { handleWaitNode } from '../nodes/wait.node.js';

describe('handleConditionNode', () => {
  const ctx = {
    tenantId: 't1',
    executionId: 'e1',
    workflowId: 'w1',
    triggerPayload: { amount: 100, name: 'Acme' },
    currentNodeId: 'n1',
  };

  it('returns trueNodeId when condition evaluates to true', async () => {
    const res = await handleConditionNode(
      {
        id: 'c1',
        type: 'CONDITION',
        config: {
          field: 'amount',
          operator: 'gt',
          value: 50,
          trueNodeId: 'yes',
          falseNodeId: 'no',
        },
      },
      ctx
    );
    expect(res.nextNodeId).toBe('yes');
  });

  it('returns falseNodeId when condition evaluates to false', async () => {
    const res = await handleConditionNode(
      {
        id: 'c1',
        type: 'CONDITION',
        config: {
          field: 'amount',
          operator: 'lt',
          value: 50,
          trueNodeId: 'yes',
          falseNodeId: 'no',
        },
      },
      ctx
    );
    expect(res.nextNodeId).toBe('no');
  });

  it('supports eq/neq/gt/lt/contains operators', async () => {
    const eq = await handleConditionNode(
      { id: 'c', type: 'CONDITION', config: { field: 'name', operator: 'eq', value: 'Acme' } },
      ctx
    );
    expect(eq.output?.matched).toBe(true);

    const contains = await handleConditionNode(
      {
        id: 'c',
        type: 'CONDITION',
        config: { field: 'name', operator: 'contains', value: 'cm' },
      },
      ctx
    );
    expect(contains.output?.matched).toBe(true);
  });

  it('throws when operator is unknown', async () => {
    await expect(
      handleConditionNode(
        {
          id: 'c',
          type: 'CONDITION',
          config: { field: 'amount', operator: 'bogus' as never, value: 1 },
        },
        ctx
      )
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});

describe('handleWaitNode', () => {
  const ctx = {
    tenantId: 't1',
    executionId: 'e1',
    workflowId: 'w1',
    triggerPayload: {},
    currentNodeId: 'n1',
  };

  it('returns PAUSED status with resumeAt = now + delayDays', async () => {
    const before = Date.now();
    const res = await handleWaitNode(
      { id: 'w', type: 'WAIT', config: { delayDays: 2 } },
      ctx
    );
    expect(res.pauseUntil).toBeDefined();
    expect(res.output?.status).toBe('PAUSED');
    const resume = new Date(String(res.output?.resumeAt)).getTime();
    expect(resume).toBeGreaterThanOrEqual(before + 2 * 86400_000 - 1000);
  });

  it('uses delayHours when provided instead of delayDays', async () => {
    const before = Date.now();
    const res = await handleWaitNode(
      { id: 'w', type: 'WAIT', config: { delayDays: 5, delayHours: 1 } },
      ctx
    );
    const resume = new Date(String(res.output?.resumeAt)).getTime();
    expect(resume - before).toBeLessThan(5 * 86400_000);
    expect(res.output?.delayHours).toBe(1);
  });
});

describe('handleActionNode', () => {
  const ctx = {
    tenantId: 't1',
    executionId: 'e1',
    workflowId: 'w1',
    triggerPayload: { x: 1 },
    currentNodeId: 'n1',
  };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '{"ok":true}',
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('makes HTTP POST to configured url with payload', async () => {
    await handleActionNode(
      {
        id: 'a',
        type: 'ACTION',
        config: { url: 'https://example.test/hook', method: 'POST', body: { a: 1 } },
      },
      ctx
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://example.test/hook',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('stores response body in output', async () => {
    const res = await handleActionNode(
      {
        id: 'a',
        type: 'ACTION',
        config: { url: 'https://example.test/hook', method: 'POST' },
      },
      ctx
    );
    expect(String(res.output?.body)).toContain('ok');
  });

  it('marks node FAILED when HTTP call throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(
      handleActionNode(
        { id: 'a', type: 'ACTION', config: { url: 'https://example.test/hook' } },
        ctx
      )
    ).rejects.toThrow('network down');
  });
});
