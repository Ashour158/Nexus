import { describe, expect, it, vi } from 'vitest';
import { TOPICS } from '@nexus/kafka';
import { handleForkNode } from '../engine/nodes/fork.node.js';
import { handleJoinNode } from '../engine/nodes/join.node.js';
import type { WorkflowNode } from '../engine/types.js';
import type { ExecutionContext } from '../engine/types.js';

describe('handleForkNode', () => {
  it('creates tracker, two child executions, publishes twice, pauses ~24h at join', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const producer = { publish } as unknown as import('@nexus/kafka').NexusProducer;

    const prisma = {
      workflowForkTracker: {
        create: vi.fn().mockResolvedValue({}),
      },
      workflowExecution: {
        create: vi
          .fn()
          .mockResolvedValueOnce({ id: 'child-a' })
          .mockResolvedValueOnce({ id: 'child-b' }),
      },
    };

    const node: WorkflowNode = {
      id: 'fork-1',
      type: 'FORK',
      config: { branches: ['b-a', 'b-b'], joinNodeId: 'join-1' },
    };

    const context: ExecutionContext = {
      executionId: 'exec-parent',
      tenantId: 't1',
      workflowId: 'wf1',
      triggerPayload: { k: 1 },
    };

    const result = await handleForkNode(node, context, prisma as never, producer);

    expect(prisma.workflowForkTracker.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        executionId: 'exec-parent',
        forkNodeId: 'fork-1',
        joinNodeId: 'join-1',
        branchNodeIds: ['b-a', 'b-b'],
      }),
    });
    expect(prisma.workflowExecution.create).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[0][0]).toBe(TOPICS.WORKFLOWS);
    expect(publish.mock.calls[0][1]).toMatchObject({
      type: 'workflow.branch.start',
      tenantId: 't1',
    });
    expect(result.nextNodeId).toBe('join-1');
    expect(result.pauseUntil).toBeInstanceOf(Date);
    const ms = result.pauseUntil!.getTime() - Date.now();
    expect(ms).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(ms).toBeLessThan(25 * 60 * 60 * 1000);
  });

  it('returns skipped when no branches', async () => {
    const prisma = {
      workflowForkTracker: { create: vi.fn() },
      workflowExecution: { create: vi.fn() },
    };
    const producer = { publish: vi.fn() } as unknown as import('@nexus/kafka').NexusProducer;

    const node: WorkflowNode = {
      id: 'fork-empty',
      type: 'FORK',
      config: { branches: [], joinNodeId: 'join-1' },
    };

    const context: ExecutionContext = {
      executionId: 'exec-1',
      tenantId: 't1',
      workflowId: 'wf1',
      triggerPayload: {},
    };

    const result = await handleForkNode(node, context, prisma as never, producer);

    expect(prisma.workflowForkTracker.create).not.toHaveBeenCalled();
    expect(prisma.workflowExecution.create).not.toHaveBeenCalled();
    expect(result.output).toEqual({ skipped: true });
  });

  it('throws when joinNodeId is missing', async () => {
    const prisma = {
      workflowForkTracker: { create: vi.fn() },
      workflowExecution: { create: vi.fn() },
    };
    const producer = { publish: vi.fn() } as unknown as import('@nexus/kafka').NexusProducer;

    const node: WorkflowNode = {
      id: 'fork-bad',
      type: 'FORK',
      config: { branches: ['b-a'] },
    };

    const context: ExecutionContext = {
      executionId: 'exec-1',
      tenantId: 't1',
      workflowId: 'wf1',
      triggerPayload: {},
    };

    await expect(handleForkNode(node, context, prisma as never, producer)).rejects.toThrow(
      'missing joinNodeId'
    );
  });
});

describe('handleJoinNode', () => {
  it('re-pauses for 60s when not all branches completed', async () => {
    const prisma = {
      workflowForkTracker: {
        findFirst: vi.fn().mockResolvedValue({
          forkNodeId: 'fork-1',
          branchNodeIds: ['b-a', 'b-b'],
          createdAt: new Date(),
        }),
      },
      workflowExecution: {
        count: vi.fn().mockResolvedValue(1), // only 1 of 2 done
      },
    };

    const node: WorkflowNode = { id: 'join-1', type: 'JOIN' };
    const context: ExecutionContext = {
      executionId: 'exec-parent',
      tenantId: 't1',
      workflowId: 'wf1',
      triggerPayload: {},
    };

    const result = await handleJoinNode(node, context, prisma as never);

    expect(result.pauseUntil).toBeInstanceOf(Date);
    expect(result.nextNodeId).toBe('join-1');
    const ms = result.pauseUntil!.getTime() - Date.now();
    expect(ms).toBeGreaterThan(55_000);
    expect(ms).toBeLessThan(65_000);
  });

  it('passes through when all branches completed', async () => {
    const prisma = {
      workflowForkTracker: {
        findFirst: vi.fn().mockResolvedValue({
          forkNodeId: 'fork-1',
          branchNodeIds: ['b-a', 'b-b'],
          createdAt: new Date(),
        }),
      },
      workflowExecution: {
        count: vi.fn().mockResolvedValue(2), // both done
      },
    };

    const node: WorkflowNode = { id: 'join-1', type: 'JOIN' };
    const context: ExecutionContext = {
      executionId: 'exec-parent',
      tenantId: 't1',
      workflowId: 'wf1',
      triggerPayload: {},
    };

    const result = await handleJoinNode(node, context, prisma as never);

    expect(result.pauseUntil).toBeUndefined();
    expect(result.output).toEqual({ completedBranches: 2 });
  });

  it('skips when no tracker found', async () => {
    const prisma = {
      workflowForkTracker: { findFirst: vi.fn().mockResolvedValue(null) },
      workflowExecution: { count: vi.fn() },
    };

    const node: WorkflowNode = { id: 'join-orphan', type: 'JOIN' };
    const context: ExecutionContext = {
      executionId: 'exec-1',
      tenantId: 't1',
      workflowId: 'wf1',
      triggerPayload: {},
    };

    const result = await handleJoinNode(node, context, prisma as never);

    expect(result.output).toEqual({ skipped: true });
    expect(prisma.workflowExecution.count).not.toHaveBeenCalled();
  });
});
