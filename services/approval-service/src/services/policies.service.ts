import type { Prisma } from '../../../../node_modules/.prisma/approval-client/index.js';
import type { ApprovalPrisma } from '../prisma.js';

interface PolicyInput {
  name: string;
  module: string;
  conditions?: Record<string, unknown>;
  steps?: unknown[];
  isActive?: boolean;
}

function matches(
  conditions: Record<string, unknown>,
  recordData: Record<string, unknown>
): boolean {
  for (const [k, v] of Object.entries(conditions)) {
    if (recordData[k] !== v) return false;
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
