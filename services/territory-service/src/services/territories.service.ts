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
    entityType: 'lead' | 'deal' | 'account',
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

  /**
   * Load the tenant's territories as a flat list of the fields needed for
   * hierarchy math (tree building, descendant resolution, cycle checks).
   */
  async function loadFlat(tenantId: string) {
    return prisma.territory.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        parentId: true,
        ownerIds: true,
        teamId: true,
        priority: true,
        isActive: true,
        isDefault: true,
      },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });
  }

  /**
   * Ids of a node's descendants (excluding the node itself), walking the
   * parentId edges of a flat list. Guards against malformed cycles.
   */
  function descendantIds(
    all: Array<{ id: string; parentId: string | null }>,
    rootId: string
  ): Set<string> {
    const childrenOf = new Map<string, string[]>();
    for (const t of all) {
      if (t.parentId) {
        const arr = childrenOf.get(t.parentId) ?? [];
        arr.push(t.id);
        childrenOf.set(t.parentId, arr);
      }
    }
    const out = new Set<string>();
    const stack = [...(childrenOf.get(rootId) ?? [])];
    while (stack.length) {
      const id = stack.pop() as string;
      if (out.has(id)) continue;
      out.add(id);
      for (const c of childrenOf.get(id) ?? []) stack.push(c);
    }
    return out;
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

    /**
     * Return a territory's members. Includes the explicit `TerritoryMember`
     * rows (manager/member roster) plus the legacy `ownerIds`/`teamId` fields
     * (the round-robin assignment pool) so existing callers keep working.
     */
    async getMembers(tenantId: string, territoryId: string) {
      const territory = await prisma.territory.findFirst({
        where: { tenantId, id: territoryId },
        select: { id: true, ownerIds: true, teamId: true },
      });
      if (!territory) return null;
      const members = await prisma.territoryMember.findMany({
        where: { tenantId, territoryId },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      });
      return { territoryId: territory.id, ownerIds: territory.ownerIds, teamId: territory.teamId, members };
    },

    /**
     * Add (or, if the user is already a member, update the role of) a member of
     * a territory. Idempotent on (territory, user) so re-adds don't duplicate.
     * Returns null when the territory does not exist in-tenant.
     */
    async addMember(
      tenantId: string,
      territoryId: string,
      input: { userId: string; role?: 'manager' | 'member' }
    ) {
      const territory = await prisma.territory.findFirst({ where: { tenantId, id: territoryId }, select: { id: true } });
      if (!territory) return null;
      const existing = await prisma.territoryMember.findFirst({
        where: { tenantId, territoryId, userId: input.userId },
        select: { id: true },
      });
      if (existing) {
        return prisma.territoryMember.update({
          where: { id: existing.id },
          data: { role: input.role ?? 'member' },
        });
      }
      return prisma.territoryMember.create({
        data: { tenantId, territoryId, userId: input.userId, role: input.role ?? 'member' },
      });
    },

    /** Update a member's role (tenant + territory scoped). */
    async updateMember(
      tenantId: string,
      territoryId: string,
      memberId: string,
      input: { role: 'manager' | 'member' }
    ) {
      const res = await prisma.territoryMember.updateMany({
        where: { tenantId, territoryId, id: memberId },
        data: { role: input.role },
      });
      if (res.count === 0) return null;
      return prisma.territoryMember.findFirst({ where: { tenantId, territoryId, id: memberId } });
    },

    /** Remove a member from a territory (tenant + territory scoped). */
    async removeMember(tenantId: string, territoryId: string, memberId: string) {
      return prisma.territoryMember.deleteMany({ where: { tenantId, territoryId, id: memberId } });
    },

    /**
     * Return the tenant's territories as a nested tree (roots first, each with
     * a `children` array), sorted by priority then name at every level. Nodes
     * whose parentId points outside the tenant's set are treated as roots so no
     * territory is ever dropped from the tree.
     */
    async getTree(tenantId: string) {
      const all = await loadFlat(tenantId);
      type Node = (typeof all)[number] & { children: Node[] };
      const byId = new Map<string, Node>();
      for (const t of all) byId.set(t.id, { ...t, children: [] });
      const roots: Node[] = [];
      for (const node of byId.values()) {
        const parent = node.parentId ? byId.get(node.parentId) : undefined;
        if (parent) parent.children.push(node);
        else roots.push(node);
      }
      return roots;
    },

    /**
     * Public assignment resolver. Given a `module` (lead|deal|account) and a
     * record's fields, resolve the winning territory via the shared rule engine
     * (criteria-JSON AssignmentRules first, legacy per-field TerritoryRules as
     * fallback). Read-only — no persistence, no event. Returns `{ territoryId }`
     * plus the owner/rule details `assign` computes.
     */
    async resolveTerritory(
      tenantId: string,
      module: 'lead' | 'deal' | 'account',
      recordData: Record<string, unknown>
    ) {
      return assign(tenantId, module, recordData);
    },

    /**
     * Territory-scoped roll-up for a territory AND its descendants.
     *
     * DATA BOUNDARY: territory-service does not hold deal amounts or account
     * records — those live in crm-service. What it owns is the routing ledger
     * (`LeadRoutingLog`: which lead/account was routed to which territory) plus
     * the membership roster. So this summary rolls up *routed-record counts* by
     * recordType across the subtree, and member/child counts. Monetary
     * aggregates must be computed by the owning service; callers may pass a
     * pre-aggregated `amounts` map (territoryId → number) to have it summed over
     * the same subtree here.
     */
    async getSummary(
      tenantId: string,
      territoryId: string,
      amounts?: Record<string, number>
    ) {
      const territory = await prisma.territory.findFirst({
        where: { tenantId, id: territoryId },
        select: { id: true, name: true },
      });
      if (!territory) return null;

      const all = await loadFlat(tenantId);
      const descendants = descendantIds(all, territoryId);
      const scopeIds = [territoryId, ...descendants];

      const [grouped, memberCount] = await Promise.all([
        prisma.leadRoutingLog.groupBy({
          by: ['recordType'],
          where: { tenantId, matchedTerritoryId: { in: scopeIds } },
          _count: { _all: true },
        }),
        prisma.territoryMember.count({ where: { tenantId, territoryId: { in: scopeIds } } }),
      ]);

      const byRecordType: Record<string, number> = {};
      let routedTotal = 0;
      for (const g of grouped as Array<{ recordType: string; _count: { _all: number } }>) {
        byRecordType[g.recordType] = g._count._all;
        routedTotal += g._count._all;
      }

      // Optional monetary roll-up from a caller-supplied per-territory map.
      let amountTotal: number | null = null;
      if (amounts) {
        amountTotal = 0;
        for (const sid of scopeIds) amountTotal += Number(amounts[sid] ?? 0);
      }

      return {
        territoryId: territory.id,
        name: territory.name,
        descendantCount: descendants.size,
        scopeTerritoryIds: scopeIds,
        routedRecords: { total: routedTotal, byRecordType },
        memberCount,
        amountTotal,
      };
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
        parentId?: string | null;
        rules: Array<{ field: string; operator: string; value: string }>;
      }
    ) {
      // Validate parent belongs to this tenant (prevents cross-tenant nesting).
      if (input.parentId) {
        const parent = await prisma.territory.findFirst({
          where: { tenantId, id: input.parentId },
          select: { id: true },
        });
        if (!parent) throw new Error('PARENT_NOT_FOUND');
      }
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
            parentId: input.parentId ?? null,
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
        parentId: string | null;
        rules: Array<{ field: string; operator: string; value: string }>;
      }>
    ) {
      const existing = await prisma.territory.findFirst({ where: { tenantId, id } });
      if (!existing) return null;
      // Re-parenting: validate the new parent exists in-tenant and that the move
      // does not create a cycle (parent may not be the node itself or one of its
      // own descendants).
      if (input.parentId !== undefined && input.parentId !== null) {
        if (input.parentId === id) throw new Error('PARENT_CYCLE');
        const all = await loadFlat(tenantId);
        if (!all.some((t) => t.id === input.parentId)) throw new Error('PARENT_NOT_FOUND');
        if (descendantIds(all, id).has(input.parentId)) throw new Error('PARENT_CYCLE');
      }
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
            parentId: input.parentId,
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
