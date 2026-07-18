import type { CrmPrisma } from '../prisma.js';

/**
 * Assignment Rules (Zoho "Assignment Rules") — round-robin / load-balanced /
 * criteria-based owner assignment for newly created or reassigned records.
 *
 * FAIL-SAFE: {@link resolveAssignee} returns null whenever there is no usable
 * active rule (or on any internal error), so the caller keeps whatever owner it
 * already had — unconfigured tenants see no behavior change.
 *
 * Reads MUST be tenant-scoped explicitly (the tenant extension only auto-injects
 * tenantId on writes), so every query below carries `tenantId`.
 */

export type AssignmentModule = 'lead' | 'deal' | 'account' | 'contact';

interface ResolvedAssignment {
  userId: string;
  ruleId: string;
}

/** Shallow AND-equality match of a criteria object against the record. */
function criteriaMatches(criteria: unknown, record: Record<string, unknown>): boolean {
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) return false;
  const entries = Object.entries(criteria as Record<string, unknown>);
  if (entries.length === 0) return true;
  return entries.every(([key, expected]) => {
    const actual = record[key];
    if (Array.isArray(expected)) return expected.includes(actual as never);
    return actual === expected;
  });
}

/** Count "open" records currently owned by `ownerId` in `module` (load metric). */
async function countOpenOwned(
  prisma: CrmPrisma,
  tenantId: string,
  module: AssignmentModule,
  ownerId: string
): Promise<number> {
  switch (module) {
    case 'deal':
      return prisma.deal.count({ where: { tenantId, ownerId, status: 'OPEN' } });
    case 'lead':
      return prisma.lead.count({ where: { tenantId, ownerId, status: { notIn: ['CONVERTED', 'UNQUALIFIED'] } } });
    case 'account':
      return prisma.account.count({ where: { tenantId, ownerId } });
    case 'contact':
      return prisma.contact.count({ where: { tenantId, ownerId } });
    default:
      return 0;
  }
}

/** Pick a pool member per the rule's strategy, persisting the round-robin cursor. */
export async function pickFromRule(
  prisma: CrmPrisma,
  tenantId: string,
  module: AssignmentModule,
  rule: { id: string; strategy: string; assigneePool: string[]; cursor: number }
): Promise<string | null> {
  const pool = rule.assigneePool ?? [];
  if (pool.length === 0) return null;

  if (rule.strategy === 'LOAD_BALANCED') {
    const counts = await Promise.all(pool.map((uid) => countOpenOwned(prisma, tenantId, module, uid)));
    let bestIdx = 0;
    for (let i = 1; i < pool.length; i++) {
      if (counts[i]! < counts[bestIdx]!) bestIdx = i;
    }
    return pool[bestIdx] ?? null;
  }

  // ROUND_ROBIN (and CRITERIA once its criteria matched): advance cursor mod pool.
  const index = ((rule.cursor % pool.length) + pool.length) % pool.length;
  const picked = pool[index] ?? null;
  try {
    await prisma.assignmentRule.update({
      where: { id: rule.id },
      data: { cursor: rule.cursor + 1 },
    });
  } catch (err) {
    // Persisting the cursor is best-effort; a failure must not block assignment.
    // eslint-disable-next-line no-console
    console.warn(`[assignment] failed to advance cursor for rule ${rule.id}`, err);
  }
  return picked;
}

/**
 * Resolve an owner for a record via the active AssignmentRule(s) for the module.
 * CRITERIA rules are evaluated first (most specific); the first whose criteria
 * matches wins. Otherwise the first active ROUND_ROBIN / LOAD_BALANCED rule
 * applies. Returns null when no active rule can assign (caller keeps its owner).
 *
 * @returns `{ userId, ruleId }` on assignment, else null. FAIL-OPEN on error.
 */
export async function resolveAssignment(
  prisma: CrmPrisma,
  tenantId: string,
  module: AssignmentModule,
  recordData: Record<string, unknown>
): Promise<ResolvedAssignment | null> {
  try {
    const rules = await prisma.assignmentRule.findMany({
      where: { tenantId, module, isActive: true },
      select: { id: true, strategy: true, criteria: true, assigneePool: true, cursor: true },
      orderBy: { createdAt: 'asc' },
    });
    if (rules.length === 0) return null;

    // CRITERIA rules first — pick the first whose criteria matches the record.
    for (const rule of rules) {
      if (rule.strategy !== 'CRITERIA') continue;
      if (!criteriaMatches(rule.criteria, recordData)) continue;
      const userId = await pickFromRule(prisma, tenantId, module, rule);
      if (userId) return { userId, ruleId: rule.id };
    }

    // Then the first non-criteria active rule.
    for (const rule of rules) {
      if (rule.strategy === 'CRITERIA') continue;
      const userId = await pickFromRule(prisma, tenantId, module, rule);
      if (userId) return { userId, ruleId: rule.id };
    }

    return null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[assignment] resolveAssignment failed for ${module}; keeping caller owner (fail-open)`, err);
    return null;
  }
}

/**
 * Apply a SPECIFIC rule (by id) to a record and return the chosen owner — used
 * by `POST /assignment-rules/:id/apply`. For a CRITERIA rule whose criteria do
 * NOT match the record, returns null (no reassignment). Returns null on any
 * error or when the rule is missing/inactive/has an empty pool.
 */
export async function assignForRule(
  prisma: CrmPrisma,
  tenantId: string,
  module: AssignmentModule,
  ruleId: string,
  recordData: Record<string, unknown>
): Promise<string | null> {
  try {
    const rule = await prisma.assignmentRule.findFirst({
      where: { id: ruleId, tenantId },
      select: { id: true, strategy: true, criteria: true, assigneePool: true, cursor: true },
    });
    if (!rule) return null;
    if (rule.strategy === 'CRITERIA' && !criteriaMatches(rule.criteria, recordData)) return null;
    return await pickFromRule(prisma, tenantId, module, rule);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[assignment] assignForRule failed for rule ${ruleId}; no reassignment (fail-open)`, err);
    return null;
  }
}

/**
 * Thin wrapper matching the brief's `resolveAssignee(tenantId, module,
 * recordData)` contract: returns just the chosen user id (or null).
 */
export async function resolveAssignee(
  prisma: CrmPrisma,
  tenantId: string,
  module: AssignmentModule,
  recordData: Record<string, unknown>
): Promise<string | null> {
  const res = await resolveAssignment(prisma, tenantId, module, recordData);
  return res?.userId ?? null;
}
