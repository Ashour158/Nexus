import { NotFoundError } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';

interface SlaCheckResult {
  withinSla: boolean;
  breaches: Array<{
    slaId: string;
    slaName: string;
    entityId: string;
    entityType: string;
    hoursElapsed: number;
    hoursAllowed: number;
  }>;
}

export function createSlaService(prisma: WorkflowPrisma) {
  return {
    async listDefinitions(tenantId: string) {
      return prisma.slaDefinition.findMany({
        where: { tenantId, isActive: true },
        orderBy: { createdAt: 'desc' },
      });
    },

    async createDefinition(
      tenantId: string,
      data: {
        name: string;
        description?: string;
        entityType: string;
        stageId?: string;
        condition?: Record<string, unknown>;
        timeLimitHours?: number;
        businessHoursOnly?: boolean;
      }
    ) {
      return prisma.slaDefinition.create({
        data: {
          tenantId,
          name: data.name,
          description: data.description ?? null,
          entityType: data.entityType,
          stageId: data.stageId ?? null,
          condition: (data.condition ?? {}) as object,
          timeLimitHours: data.timeLimitHours ?? 24,
          businessHoursOnly: data.businessHoursOnly ?? true,
        },
      });
    },

    async checkSla(tenantId: string, entityType: string, entityId: string, slaId?: string): Promise<SlaCheckResult> {
      const definitions = await prisma.slaDefinition.findMany({
        where: {
          tenantId,
          entityType,
          isActive: true,
          ...(slaId ? { id: slaId } : {}),
        },
      });

      const breaches: SlaCheckResult['breaches'] = [];

      for (const def of definitions) {
        // Check if there's already an unresolved breach for this entity+SLA
        const existingBreach = await prisma.slaBreach.findFirst({
          where: {
            tenantId,
            slaId: def.id,
            entityId,
            status: { in: ['BREACHED', 'ESCALATED'] },
          },
        });

        if (existingBreach) {
          breaches.push({
            slaId: def.id,
            slaName: def.name,
            entityId,
            entityType,
            hoursElapsed: def.timeLimitHours + 1, // already breached
            hoursAllowed: def.timeLimitHours,
          });
          continue;
        }

        // For workflow-based SLA checks, we can't directly access CRM timestamps.
        // In production, this would query CRM/ClickHouse for the entity's creation/update time.
        // Here we return a placeholder that assumes within SLA unless explicitly breached.
      }

      return {
        withinSla: breaches.length === 0,
        breaches,
      };
    },

    async recordBreach(
      tenantId: string,
      slaId: string,
      entityId: string,
      entityType: string,
      metadata?: Record<string, unknown>
    ) {
      const def = await prisma.slaDefinition.findFirst({ where: { id: slaId, tenantId } });
      if (!def) throw new NotFoundError('SlaDefinition', slaId);

      return prisma.slaBreach.create({
        data: {
          tenantId,
          slaId,
          entityId,
          entityType,
          status: 'BREACHED',
          metadata: (metadata ?? {}) as object,
        },
      });
    },

    async escalateBreach(tenantId: string, breachId: string) {
      const breach = await prisma.slaBreach.findFirst({ where: { id: breachId, tenantId } });
      if (!breach) throw new NotFoundError('SlaBreach', breachId);
      if (breach.status === 'RESOLVED') throw new Error('Cannot escalate a resolved breach');

      return prisma.slaBreach.update({
        where: { id: breachId },
        data: {
          status: 'ESCALATED',
          escalationLevel: { increment: 1 },
        },
      });
    },

    async resolveBreach(tenantId: string, breachId: string) {
      const breach = await prisma.slaBreach.findFirst({ where: { id: breachId, tenantId } });
      if (!breach) throw new NotFoundError('SlaBreach', breachId);

      return prisma.slaBreach.update({
        where: { id: breachId },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
    },

    async listBreaches(tenantId: string, status?: string) {
      return prisma.slaBreach.findMany({
        where: { tenantId, ...(status ? { status } : {}) },
        include: { sla: true },
        orderBy: { breachedAt: 'desc' },
      });
    },
  };
}
