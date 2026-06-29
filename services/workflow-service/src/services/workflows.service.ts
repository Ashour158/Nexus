import { NotFoundError, ValidationError } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';
import type { WorkflowEdge, WorkflowNode } from '../engine/types.js';

function validateWorkflowGraph(nodes: unknown[], edges: unknown[]) {
  const nodeList = Array.isArray(nodes) ? (nodes as WorkflowNode[]) : [];
  const edgeList = Array.isArray(edges) ? (edges as WorkflowEdge[]) : [];
  for (const node of nodeList) {
    if (node.type === 'CONDITION') {
      const outgoing = edgeList.filter((e) => e.from === node.id);
      const trueEdge = outgoing.find((e) => e.condition === 'true');
      const falseEdge = outgoing.find((e) => e.condition === 'false');
      if (!trueEdge || !falseEdge) {
        throw new ValidationError(
          `CONDITION node "${node.id}" must have exactly two outgoing edges labelled "true" and "false"`
        );
      }
    }
  }
}

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
      validateWorkflowGraph(data.nodes, data.edges);
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
      }>,
      userId?: string
    ) {
      const row = await prisma.workflowTemplate.findFirst({ where: { id, tenantId } });
      if (!row) throw new NotFoundError('WorkflowTemplate', id);
      const mergedNodes = data.nodes ?? (row.nodes as unknown as unknown[]);
      const mergedEdges = data.edges ?? (row.edges as unknown as unknown[]);
      validateWorkflowGraph(mergedNodes, mergedEdges);

      // Save current state as a version snapshot before updating
      await prisma.workflowVersion.create({
        data: {
          tenantId,
          workflowId: id,
          version: row.version,
          nodes: row.nodes,
          edges: row.edges,
          name: row.name,
          description: row.description,
          createdBy: userId ?? 'system',
        },
      });

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

    async listVersions(tenantId: string, workflowId: string) {
      const wf = await prisma.workflowTemplate.findFirst({ where: { id: workflowId, tenantId } });
      if (!wf) throw new NotFoundError('WorkflowTemplate', workflowId);
      return prisma.workflowVersion.findMany({
        where: { workflowId, tenantId },
        orderBy: { version: 'desc' },
      });
    },

    async rollback(tenantId: string, workflowId: string, versionId: string) {
      const wf = await prisma.workflowTemplate.findFirst({ where: { id: workflowId, tenantId } });
      if (!wf) throw new NotFoundError('WorkflowTemplate', workflowId);

      const version = await prisma.workflowVersion.findFirst({
        where: { id: versionId, workflowId, tenantId },
      });
      if (!version) throw new NotFoundError('WorkflowVersion', versionId);

      // Save current state as a new version before rolling back
      await prisma.workflowVersion.create({
        data: {
          tenantId,
          workflowId,
          version: wf.version + 1,
          nodes: wf.nodes,
          edges: wf.edges,
          name: wf.name,
          description: wf.description,
          createdBy: 'system-rollback',
        },
      });

      // Rollback to the selected version
      return prisma.workflowTemplate.update({
        where: { id: workflowId },
        data: {
          nodes: version.nodes,
          edges: version.edges,
          name: version.name,
          description: version.description,
          version: { increment: 1 },
        },
      });
    },
  };
}

export type WorkflowsService = ReturnType<typeof createWorkflowsService>;
