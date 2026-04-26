import { describe, expect, it, vi } from 'vitest';
import { createValidationService } from '../services/validation.service.js';

describe('createValidationService', () => {
  it('returns valid when no transition rule exists', async () => {
    const prisma = {
      stageTransitionRule: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as never;
    const svc = createValidationService(prisma);
    const res = await svc.validateTransition({
      pipelineId: 'p1',
      fromStageId: 's1',
      toStageId: 's2',
      dealSnapshot: {},
    });
    expect(res).toEqual({ valid: true, errors: [] });
  });

  it('collects errors from failing rules', async () => {
    const prisma = {
      stageTransitionRule: {
        findFirst: vi.fn().mockResolvedValue({
          rules: [
            {
              type: 'min_value',
              field: 'amount',
              minValue: 100,
              errorMessage: 'Min 100',
            },
          ],
        }),
      },
    } as never;
    const svc = createValidationService(prisma);
    const res = await svc.validateTransition({
      pipelineId: 'p1',
      fromStageId: 's1',
      toStageId: 's2',
      dealSnapshot: { amount: 50 },
    });
    expect(res.valid).toBe(false);
    expect(res.errors).toContain('Min 100');
  });

  it('passes when snapshot satisfies rules', async () => {
    const prisma = {
      stageTransitionRule: {
        findFirst: vi.fn().mockResolvedValue({
          rules: [
            {
              type: 'required_field',
              field: 'amount',
              errorMessage: 'Amount required',
            },
            {
              type: 'min_value',
              field: 'amount',
              minValue: 100,
              errorMessage: 'Min 100',
            },
          ],
        }),
      },
    } as never;
    const svc = createValidationService(prisma);
    const res = await svc.validateTransition({
      pipelineId: 'p1',
      fromStageId: 's1',
      toStageId: 's2',
      dealSnapshot: { amount: 150 },
    });
    expect(res).toEqual({ valid: true, errors: [] });
  });
});
