import { TOPICS, type NexusProducer } from '@nexus/kafka';
import type { TerritoryPrisma } from '../prisma.js';
import {
  matchTerritory,
  matchAssignmentRule,
  type EvalTerritory,
  type EvalAssignmentRule,
  type MatchResult,
} from '../rule-engine.js';

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

  /**
   * Resolve the next owner for a territory using its ownerIds. A single owner
   * is returned directly; multiple owners are round-robined via RoundRobinState
   * (per tenant+territory). Returns undefined when the territory has no owners.
   */
  async function nextOwnerForTerritory(
    tenantId: string,
    territoryId: string,
    ownerIds: string[]
  ): Promise<string | undefined> {
    if (ownerIds.length === 0) return undefined;
    if (ownerIds.length === 1) return ownerIds[0];
    const rr = await prisma.roundRobinState.upsert({
      where: { tenantId_territoryId: { tenantId, territoryId } },
      update: {},
      create: { tenantId, territoryId, lastIndex: 0 },
    });
    const nextIndex = (rr.lastIndex + 1) % ownerIds.length;
    await prisma.roundRobinState.update({ where: { id: rr.id }, data: { lastIndex: nextIndex } });
    return ownerIds[nextIndex];
  }

  /**
   * B6 assignment resolver. Evaluate the tenant's `AssignmentRule`s (criteria
   * JSON, highest priority first) against an incoming lead/deal's fields and
   * return the winning `{ territoryId, ownerId }`. When a rule pins an explicit
   * `ownerId` that wins; otherwise (or when the rule points at a `queue`) the
   * owner is round-robined from the target territory's ownerIds. Falls back to
   * the legacy per-field TerritoryRule engine when no assignment rule matches,
   * so both layers cooperate. Fail-open: any error returns an unassigned result
   * rather than throwing (caller must never crash on routing).
   */
  async function assign(
    tenantId: string,
    entityType: 'lead' | 'deal',
    fields: Record<string, unknown>
  ): Promise<{
    territoryId: string | null;
    ownerId: string | null;
    ruleId: string | null;
    viaAssignmentRule: boolean;
    viaDefault: boolean;
  }> {
    try {
      const rules = await prisma.assignmentRule.findMany({
        where: { tenantId, isActive: true },
        orderBy: { priority: 'desc' },
      });
      const matched = matchAssignmentRule(
        rules as unknown as EvalAssignmentRule[],
        entityType,
        fields
      );
      if (matched) {
        let ownerId: string | undefined = matched.ownerId ?? undefined;
        if (!ownerId) {
          const territory = await prisma.territory.findFirst({
            where: { tenantId, id: matched.territoryId },
            select: { ownerIds: true },
          });
          ownerId = await nextOwnerForTerritory(
            tenantId,
            matched.territoryId,
            territory?.ownerIds ?? []
          );
        }
        return {
          territoryId: matched.territoryId,
          ownerId: ownerId ?? null,
          ruleId: matched.id,
          viaAssignmentRule: true,
          viaDefault: false,
        };
      }

      // Fall back to the legacy per-field TerritoryRule engine.
      const territories = await prisma.territory.findMany({
        where: { tenantId, isActive: true },
        include: { rules: true },
        orderBy: { priority: 'desc' },
      });
      const legacy = matchTerritory(territories as unknown as EvalTerritory[], fields) as
        | (MatchResult & { territory: (typeof territories)[number] })
        | null;
      if (!legacy) {
        return { territoryId: null, ownerId: null, ruleId: null, viaAssignmentRule: false, viaDefault: false };
      }
      const ownerId = await nextOwnerForTerritory(
        tenantId,
        legacy.territory.id,
        legacy.territory.ownerIds
      );
      return {
        territoryId: legacy.territory.id,
        ownerId: ownerId ?? null,
        ruleId: null,
        viaAssignmentRule: false,
        viaDefault: legacy.viaDefault,
      };
    } catch (err) {
      console.warn('[territories.assign] failed, returning unassigned:', (err as Error)?.message);
      return { territoryId: null, ownerId: null, ruleId: null, viaAssignmentRule: false, viaDefault: false };
    }
  }

  return {
    assign,

    /** List a territory's assignment rules (highest priority first). */
    async listAssignmentRules(tenantId: string, territoryId: string) {
      const territory = await prisma.territory.findFirst({ where: { tenantId, id: territoryId }, select: { id: true } });
      if (!territory) return null;
      return prisma.assignmentRule.findMany({
        where: { tenantId, territoryId },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
    },

    /** Create an assignment rule for a territory. */
    async createAssignmentRule(
      tenantId: string,
      territoryId: string,
      input: {
        name: string;
        entityType?: 'lead' | 'deal' | 'any';
        criteria: Record<string, unknown>;
        ownerId?: string | null;
        queue?: string | null;
        priority?: number;
        isActive?: boolean;
      }
    ) {
      const territory = await prisma.territory.findFirst({ where: { tenantId, id: territoryId }, select: { id: true } });
      if (!territory) return null;
      return prisma.assignmentRule.create({
        data: {
          tenantId,
          territoryId,
          name: input.name,
          entityType: input.entityType ?? 'lead',
          criteria: input.criteria as object,
          ownerId: input.ownerId ?? null,
          queue: input.queue ?? null,
          priority: input.priority ?? 0,
          isActive: input.isActive ?? true,
        },
      });
    },

    /** Delete an assignment rule (tenant-scoped). */
    async deleteAssignmentRule(tenantId: string, ruleId: string) {
      return prisma.assignmentRule.deleteMany({ where: { tenantId, id: ruleId } });
    },

    /** Return a territory's members (owner ids + team) for the members surface. */
    async getMembers(tenantId: string, territoryId: string) {
      const territory = await prisma.territory.findFirst({
        where: { tenantId, id: territoryId },
        select: { id: true, ownerIds: true, teamId: true },
      });
      if (!territory) return null;
      return { territoryId: territory.id, ownerIds: territory.ownerIds, teamId: territory.teamId };
    },

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
