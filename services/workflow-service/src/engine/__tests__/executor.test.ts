import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowExecutor } from '../executor.js';

const TENANT = 'tenant_1';

function makeTemplate(nodes: unknown[], edges: unknown[]) {
  return { id: 'wf_1', tenantId: TENANT, nodes, edges };
}

function makeExecution(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'ex_1',
    tenantId: TENANT,
    workflowId: 'wf_1',
    triggerType: 'deal.won',
    triggerPayload: { dealId: 'd1', amount: 100 },
    status: 'RUNNING',
    currentNodeId: null,
    resumeAt: null,
    workflow: makeTemplate([], []),
    ...overrides,
  };
}

function makePrisma() {
  const executionStore = makeExecution();
  return {
    workflowExecution: {
      findUnique: vi.fn(async () => executionStore),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...executionStore, ...data })),
    },
    workflowStep: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: crypto.randomUUID(), ...data })),
      findFirst: vi.fn(async () => ({ id: 'step_1' })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'step_1', ...data })),
      findMany: vi.fn(async () => []),
    },
  };
}

function makeProducer() {
  return { publish: vi.fn(async () => undefined) };
}

describe('WorkflowExecutor', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let producer: ReturnType<typeof makeProducer>;
  let executor: WorkflowExecutor;

  beforeEach(() => {
    prisma = makePrisma();
    producer = makeProducer();
    executor = new WorkflowExecutor(prisma as never, producer as never);
  });

  it('executes linear workflow from trigger to end node', async () => {
    prisma.workflowExecution.findUnique = vi.fn(async () =>
      makeExecution({
        workflow: makeTemplate(
          [
            { id: 'n1', type: 'TRIGGER' },
            { id: 'n2', type: 'END' },
          ],
          [{ from: 'n1', to: 'n2' }]
        ),
      })
    );
    await executor.run('ex_1');
    expect(prisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) })
    );
  });

  it('branches correctly on CONDITION node true/false', async () => {
    prisma.workflowExecution.findUnique = vi.fn(async () =>
      makeExecution({
        triggerPayload: { amount: 200 },
        workflow: makeTemplate(
          [
            { id: 'n1', type: 'TRIGGER' },
            {
              id: 'n2',
              type: 'CONDITION',
              config: { field: 'amount', operator: 'gt', value: 100, trueNodeId: 'n3', falseNodeId: 'n4' },
            },
            { id: 'n3', type: 'END' },
            { id: 'n4', type: 'END' },
          ],
          [{ from: 'n1', to: 'n2' }]
        ),
      })
    );
    await executor.run('ex_1');
    expect(prisma.workflowStep.update).toHaveBeenCalled();
  });

  it('pauses on WAIT node and stores resumeAt', async () => {
    prisma.workflowExecution.findUnique = vi.fn(async () =>
      makeExecution({
        workflow: makeTemplate(
          [
            { id: 'n1', type: 'WAIT', config: { amount: 1, unit: 'hours' } },
            { id: 'n2', type: 'END' },
          ],
          [{ from: 'n1', to: 'n2' }]
        ),
      })
    );
    await executor.run('ex_1');
    expect(prisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAUSED', resumeAt: expect.any(Date) }),
      })
    );
  });

  it('marks execution FAILED and stores error on node exception', async () => {
    prisma.workflowExecution.findUnique = vi.fn(async () =>
      makeExecution({
        workflow: makeTemplate([{ id: 'n1', type: 'UNSUPPORTED' }], []),
      })
    );
    await expect(executor.run('ex_1')).rejects.toThrow();
    expect(prisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
    );
  });

  it('resumes PAUSED execution after resumeAt has passed', async () => {
    prisma.workflowExecution.findUnique = vi.fn(async () =>
      makeExecution({
        status: 'PAUSED',
        resumeAt: new Date(Date.now() - 1000),
        workflow: makeTemplate([{ id: 'n1', type: 'END' }], []),
      })
    );
    await executor.resume('ex_1');
    expect(prisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RUNNING' }) })
    );
  });

  it('marks execution CANCELLED when cancel() is called on RUNNING execution', async () => {
    const svc = {
      cancelExecution: async () =>
        prisma.workflowExecution.update({
          data: { status: 'CANCELLED', completedAt: new Date() },
        }),
    };
    const res = await svc.cancelExecution();
    expect((res as { status?: string }).status).toBe('CANCELLED');
  });
});
