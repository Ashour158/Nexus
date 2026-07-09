import { TOPICS, type NexusProducer } from '@nexus/kafka';
import type { TerritoryPrisma } from '../prisma.js';
import { matchTerritory, type EvalTerritory, type MatchResult } from '../rule-engine.js';

/** Record kinds that can be routed to a territory. */
export type RoutableRecordType = 'LEAD' | 'ACCOUNT';

export function createTerritoriesService(prisma: TerritoryPrisma, producer: NexusProducer) {
  /**
   * Route a record (lead or account) to a territory using the priority-ordered
   * rule engine, then pick an owner (single owner, or round-robin across
   * owners), write an audit log row (recording which rules matched), and emit
   * a `<record>.routed` event. Fail-open: on any error it records nothing and
   * returns null rather than throwing, so the caller/consumer never crashes.
   */
  async function assignRecord(
    tenantId: string,
    recordType: RoutableRecordType,
    recordId: string,
    recordData: Record<string, unknown>
  ) {
    try {
      const territories = await prisma.territory.findMany({
        where: { tenantId, isActive: true },
        include: { rules: true },
        orderBy: { priority: 'desc' },
      });

      const match = matchTerritory(territories as unknown as EvalTerritory[], recordData) as
        | (MatchResult & { territory: (typeof territories)[number] })
        | null;

      if (!match) {
        await prisma.leadRoutingLog.create({
          data: {
            tenantId,
            leadId: recordId,
            recordType,
            matchedTerritoryId: null,
            matchedRuleIds: [],
            viaDefault: false,
            assignedOwnerId: null,
          },
        });
        return null;
      }

      const { territory, matchedRuleIds, viaDefault } = match;
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
          leadId: recordId,
          recordType,
          matchedTerritoryId: territory.id,
          matchedRuleIds,
          viaDefault,
          assignedOwnerId: assignedOwnerId ?? null,
        },
      });

      const topic = recordType === 'ACCOUNT' ? TOPICS.ACCOUNTS : TOPICS.LEADS;
      const type = recordType === 'ACCOUNT' ? 'account.routed' : 'lead.routed';
      await producer
        .publish(topic, {
          type,
          tenantId,
          payload: {
            [recordType === 'ACCOUNT' ? 'accountId' : 'leadId']: recordId,
            territoryId: territory.id,
            assignedOwnerId,
            matchedRuleIds,
            viaDefault,
          },
        })
        .catch(() => undefined);

      return { territory, assignedOwnerId, matchedRuleIds, viaDefault };
    } catch (err) {
      console.warn('[territories.assignRecord] failed, leaving record unassigned:', (err as Error)?.message);
      return null;
    }
  }

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
        isDefault?: boolean;
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
            isDefault: input.isDefault ?? false,
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
        isDefault: boolean;
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
            isDefault: input.isDefault,
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

    /** Generic router: route any record (lead or account) to a territory. */
    assignRecord,

    /** Backwards-compatible lead entry point. `leadData.id` supplies the lead id. */
    async assignLead(tenantId: string, leadData: Record<string, unknown>) {
      return assignRecord(tenantId, 'LEAD', String(leadData.id ?? ''), leadData);
    },

    /** Route an account by explicit id + attribute bag. */
    async assignAccount(tenantId: string, accountId: string, accountData: Record<string, unknown>) {
      return assignRecord(tenantId, 'ACCOUNT', accountId, accountData);
    },

    /** Dry-run: return the territory a record WOULD route to, without side effects. */
    async testAssignment(tenantId: string, recordData: Record<string, unknown>) {
      const territories = await prisma.territory.findMany({
        where: { tenantId, isActive: true },
        include: { rules: true },
        orderBy: { priority: 'desc' },
      });
      const match = matchTerritory(territories as unknown as EvalTerritory[], recordData) as
        | (MatchResult & { territory: (typeof territories)[number] })
        | null;
      if (!match) return null;
      return {
        territory: match.territory,
        assignedOwnerId: match.territory.ownerIds[0] ?? null,
        matchedRuleIds: match.matchedRuleIds,
        viaDefault: match.viaDefault,
      };
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
