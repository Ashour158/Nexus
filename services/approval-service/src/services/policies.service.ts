import type { Prisma } from '../../../../node_modules/.prisma/approval-client/index.js';
import type { ApprovalPrisma } from '../prisma.js';

interface PolicyInput {
  name: string;
  module: string;
  conditions?: Record<string, unknown>;
  steps?: unknown[];
  isActive?: boolean;
}

/**
 * Compare one record field against a condition value. A plain value means exact
 * equality (back-compat). An operator object enables threshold gating — the common
 * "deals/discounts ABOVE $X need approval" that pure equality couldn't express:
 *   { amount: { gt: 10000 } }   { discountPercent: { gte: 15 } }   { stage: { in: [...] } }
 */
function compareValue(actual: unknown, expected: unknown): boolean {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    const e = expected as Record<string, unknown>;
    const n = (x: unknown) => (typeof x === 'number' ? x : Number(x));
    if ('eq' in e && actual !== e.eq) return false;
    if ('ne' in e && actual === e.ne) return false;
    if ('gt' in e && !(n(actual) > n(e.gt))) return false;
    if ('gte' in e && !(n(actual) >= n(e.gte))) return false;
    if ('lt' in e && !(n(actual) < n(e.lt))) return false;
    if ('lte' in e && !(n(actual) <= n(e.lte))) return false;
    if ('in' in e && (!Array.isArray(e.in) || !e.in.includes(actual))) return false;
    if ('not_in' in e && Array.isArray(e.not_in) && e.not_in.includes(actual)) return false;
    return true;
  }
  return actual === expected;
}

function matches(
  conditions: Record<string, unknown>,
  recordData: Record<string, unknown>
): boolean {
  for (const [k, v] of Object.entries(conditions)) {
    if (!compareValue(recordData[k], v)) return false;
  }
  return true;
}

export function createPoliciesService(prisma: ApprovalPrisma) {
  return {
    async listPolicies(tenantId: string, module?: string) {
      return prisma.approvalPolicy.findMany({
        where: { tenantId, module, isActive: true },
        orderBy: { createdAt: 'desc' },
      });
    },

    async getPolicy(tenantId: string, id: string) {
      return prisma.approvalPolicy.findFirst({ where: { tenantId, id } });
    },

    async createPolicy(tenantId: string, input: PolicyInput) {
      return prisma.approvalPolicy.create({
        data: {
          tenantId,
          name: input.name,
          module: input.module,
          conditions: (input.conditions ?? {}) as Prisma.InputJsonValue,
          steps: (input.steps ?? []) as Prisma.InputJsonValue,
          isActive: input.isActive ?? true,
        },
      });
    },

    async updatePolicy(
      tenantId: string,
      id: string,
      input: Partial<PolicyInput>
    ) {
      const existing = await prisma.approvalPolicy.findFirst({ where: { tenantId, id } });
      if (!existing) return null;
      const data: Prisma.ApprovalPolicyUpdateInput = {
        name: input.name,
        module: input.module,
        conditions: input.conditions as Prisma.InputJsonValue | undefined,
        steps: input.steps as Prisma.InputJsonValue | undefined,
        isActive: input.isActive,
      };
      return prisma.approvalPolicy.update({ where: { id }, data });
    },

    async deletePolicy(tenantId: string, id: string) {
      const existing = await prisma.approvalPolicy.findFirst({ where: { tenantId, id } });
      if (!existing) return null;
      return prisma.approvalPolicy.update({
        where: { id },
        data: { isActive: false },
      });
    },

    async findMatchingPolicy(
      tenantId: string,
      module: string,
      recordData: Record<string, unknown>
    ) {
      const policies = await prisma.approvalPolicy.findMany({
        where: { tenantId, module, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      for (const policy of policies) {
        const cond = (policy.conditions as Record<string, unknown>) ?? {};
        if (matches(cond, recordData)) return policy;
      }
      return null;
    },
  };
}
