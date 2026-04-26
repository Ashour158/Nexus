import { TOPICS, type NexusProducer } from '@nexus/kafka';
import type { TerritoryPrisma } from '../prisma.js';

function ruleMatch(
  operator: string,
  actual: unknown,
  expected: string
): boolean {
  const a = actual ?? '';
  switch (operator) {
    case 'eq':
      return String(a) === expected;
    case 'neq':
      return String(a) !== expected;
    case 'contains':
      return String(a).toLowerCase().includes(expected.toLowerCase());
    case 'gte':
      return Number(a) >= Number(expected);
    case 'lte':
      return Number(a) <= Number(expected);
    case 'in':
      return expected.split(',').map((x) => x.trim()).includes(String(a));
    default:
      return false;
  }
}

export function createTerritoriesService(prisma: TerritoryPrisma, producer: NexusProducer) {
  return {
    async listTerritories(tenantId: string) {
      const rows = await prisma.territory.findMany({
        where: { tenantId, isActive: true },
        include: { _count: { select: { rules: true } } },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      });
      return rows.map((r) => ({ ...r, ruleCount: r._count.rules }));
    },

    async getTerritory(tenantId: string, id: string) {
      return prisma.territory.findFirst({
        where: { tenantId, id },
        include: { rules: true },
      });
    },

    async createTerritory(
      tenantId: string,
      input: {
        name: string;
        description?: string;
        type: 'GEOGRAPHIC' | 'INDUSTRY' | 'ACCOUNT_SIZE' | 'CUSTOM';
        ownerIds: string[];
        teamId?: string;
        priority?: number;
        rules: Array<{ field: string; operator: string; value: string }>;
      }
    ) {
      return prisma.$transaction(async (tx) => {
        const t = await tx.territory.create({
          data: {
            tenantId,
            name: input.name,
            description: input.description ?? null,
            type: input.type,
            ownerIds: input.ownerIds,
            teamId: input.teamId ?? null,
            priority: input.priority ?? 0,
          },
        });
        if (input.rules.length) {
          await tx.territoryRule.createMany({
            data: input.rules.map((r) => ({ territoryId: t.id, ...r })),
          });
        }
        return t;
      });
    },

    async updateTerritory(
      tenantId: string,
      id: string,
      input: Partial<{
        name: string;
        description: string | null;
        type: 'GEOGRAPHIC' | 'INDUSTRY' | 'ACCOUNT_SIZE' | 'CUSTOM';
        ownerIds: string[];
        teamId: string | null;
        priority: number;
        rules: Array<{ field: string; operator: string; value: string }>;
      }>
    ) {
      const existing = await prisma.territory.findFirst({ where: { tenantId, id } });
      if (!existing) return null;
      return prisma.$transaction(async (tx) => {
        if (input.rules) {
          await tx.territoryRule.deleteMany({ where: { territoryId: id } });
          if (input.rules.length) {
            await tx.territoryRule.createMany({
              data: input.rules.map((r) => ({ territoryId: id, ...r })),
            });
          }
        }
        return tx.territory.update({
          where: { id },
          data: {
            name: input.name,
            description: input.description,
            type: input.type,
            ownerIds: input.ownerIds,
            teamId: input.teamId,
            priority: input.priority,
          },
        });
      });
    },

    async deleteTerritory(tenantId: string, id: string) {
      return prisma.territory.updateMany({
        where: { tenantId, id },
        data: { isActive: false },
      });
    },

    async assignLead(tenantId: string, leadData: Record<string, unknown>) {
      const territories = await prisma.territory.findMany({
        where: { tenantId, isActive: true },
        include: { rules: true },
        orderBy: { priority: 'desc' },
      });
      for (const territory of territories) {
        const ok = territory.rules.every((r) => ruleMatch(r.operator, leadData[r.field], r.value));
        if (!ok) continue;
        let assignedOwnerId: string | undefined;
        if (territory.ownerIds.length === 1) {
          assignedOwnerId = territory.ownerIds[0];
        } else if (territory.ownerIds.length > 1) {
          const rr = await prisma.roundRobinState.upsert({
            where: { tenantId_territoryId: { tenantId, territoryId: territory.id } },
            update: {},
            create: { tenantId, territoryId: territory.id, lastIndex: 0 },
          });
          const nextIndex = (rr.lastIndex + 1) % territory.ownerIds.length;
          assignedOwnerId = territory.ownerIds[nextIndex];
          await prisma.roundRobinState.update({
            where: { id: rr.id },
            data: { lastIndex: nextIndex },
          });
        }
        await prisma.leadRoutingLog.create({
          data: {
            tenantId,
            leadId: String(leadData.id ?? ''),
            matchedTerritoryId: territory.id,
            assignedOwnerId: assignedOwnerId ?? null,
          },
        });
        await producer.publish(TOPICS.LEADS, {
          type: 'lead.routed',
          tenantId,
          payload: {
            leadId: String(leadData.id ?? ''),
            territoryId: territory.id,
            assignedOwnerId,
          },
        });
        return { territory, assignedOwnerId };
      }
      await prisma.leadRoutingLog.create({
        data: {
          tenantId,
          leadId: String(leadData.id ?? ''),
          matchedTerritoryId: null,
          assignedOwnerId: null,
        },
      });
      return null;
    },

    async testAssignment(tenantId: string, leadData: Record<string, unknown>) {
      const territories = await prisma.territory.findMany({
        where: { tenantId, isActive: true },
        include: { rules: true },
        orderBy: { priority: 'desc' },
      });
      for (const territory of territories) {
        const ok = territory.rules.every((r) => ruleMatch(r.operator, leadData[r.field], r.value));
        if (!ok) continue;
        return { territory, assignedOwnerId: territory.ownerIds[0] ?? null };
      }
      return null;
    },

    async getRoutingLogs(tenantId: string, leadId: string | undefined, page: number, limit: number) {
      const where = { tenantId, leadId };
      const [data, total] = await Promise.all([
        prisma.leadRoutingLog.findMany({
          where,
          include: { territory: true },
          orderBy: { routedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.leadRoutingLog.count({ where }),
      ]);
      return { data, total, page, limit };
    },
  };
}
