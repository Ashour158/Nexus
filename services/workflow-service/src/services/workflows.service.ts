import { NotFoundError } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';

export function createWorkflowsService(prisma: WorkflowPrisma) {
  return {
    async createWorkflow(
      tenantId: string,
      data: {
        name: string;
        description?: string;
        trigger: string;
        triggerConditions?: Record<string, unknown>;
        nodes: unknown[];
        edges: unknown[];
      }
    ) {
      return prisma.workflowTemplate.create({
        data: {
          tenantId,
          name: data.name,
          description: data.description,
          trigger: data.trigger,
          triggerConditions: (data.triggerConditions ?? {}) as object,
          nodes: data.nodes as object,
          edges: data.edges as object,
        },
      });
    },

    async updateWorkflow(
      tenantId: string,
      id: string,
      data: Partial<{
        name: string;
        description: string;
        trigger: string;
        triggerConditions: Record<string, unknown>;
        nodes: unknown[];
        edges: unknown[];
      }>
    ) {
      const row = await prisma.workflowTemplate.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('WorkflowTemplate', id);
      return prisma.workflowTemplate.update({
        where: { id },
        data: {
          ...data,
          ...(data.triggerConditions ? { triggerConditions: data.triggerConditions as object } : {}),
          ...(data.nodes ? { nodes: data.nodes as object } : {}),
          ...(data.edges ? { edges: data.edges as object } : {}),
          version: { increment: 1 },
        },
      });
    },

    async activateWorkflow(tenantId: string, id: string) {
      const row = await prisma.workflowTemplate.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('WorkflowTemplate', id);
      return prisma.workflowTemplate.update({ where: { id }, data: { isActive: true } });
    },

    async deactivateWorkflow(tenantId: string, id: string) {
      const row = await prisma.workflowTemplate.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('WorkflowTemplate', id);
      return prisma.workflowTemplate.update({ where: { id }, data: { isActive: false } });
    },

    async listWorkflows(tenantId: string, page: number, limit: number) {
      const p = Math.max(1, page);
      const l = Math.min(100, Math.max(1, limit));
      const skip = (p - 1) * l;
      const [total, data] = await prisma.$transaction([
        prisma.workflowTemplate.count({ where: { tenantId } }),
        prisma.workflowTemplate.findMany({
          where: { tenantId },
          skip,
          take: l,
          orderBy: { updatedAt: 'desc' },
        }),
      ]);
      return { data, total, page: p, limit: l, totalPages: Math.max(1, Math.ceil(total / l)) };
    },
  };
}

export type WorkflowsService = ReturnType<typeof createWorkflowsService>;
