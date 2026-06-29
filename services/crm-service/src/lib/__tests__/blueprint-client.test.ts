import { describe, expect, it, vi } from 'vitest';
import { BusinessRuleError } from '@nexus/service-utils';

const { blueprintPost } = vi.hoisted(() => ({
  blueprintPost: vi.fn(),
}));

vi.mock('@nexus/service-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nexus/service-utils')>();
  return {
    ...actual,
    createHttpClient: () => ({ post: blueprintPost }),
  };
});

import { assertValidStageTransition } from '../blueprint-client.js';

describe('blueprint transition client', () => {
  it('fails closed when blueprint validation service is unavailable', async () => {
    blueprintPost.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(
      assertValidStageTransition('tenant_1', 'pipeline_1', 'stage_1', 'stage_2', {
        amount: 1000,
        linkedContacts: [],
        completedActivityTypes: [],
      })
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });
});
