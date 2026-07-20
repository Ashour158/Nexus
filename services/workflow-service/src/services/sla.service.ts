import { NotFoundError } from '@nexus/service-utils';
import { TOPICS, type NexusProducer } from '@nexus/kafka';
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

/**
 * Business-hours elapsed calculation between two instants.
 *
 * A pragmatic model: counts only Mon–Fri, 09:00–17:00 (8h/day) local time.
 * Used when an SlaDefinition sets `businessHoursOnly`. When false we use plain
 * wall-clock elapsed hours. This is deliberately simple — no holiday calendar —
 * and errs toward under-counting elapsed time (i.e. it never fabricates a
 * breach that a wall-clock measure would not also eventually produce).
 */
export function businessHoursBetween(start: Date, end: Date): number {
  if (end <= start) return 0;
  const DAY_START = 9;
  const DAY_END = 17;
  const HOURS_PER_DAY = DAY_END - DAY_START;
  let total = 0;
  // Walk day-by-day from the start date to the end date.
  const cursor = new Date(start.getTime());
  while (cursor < end) {
    const day = cursor.getDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) {
      const windowStart = new Date(cursor);
      windowStart.setHours(DAY_START, 0, 0, 0);
      const windowEnd = new Date(cursor);
      windowEnd.setHours(DAY_END, 0, 0, 0);
      const from = start > windowStart ? start : windowStart;
      const to = end < windowEnd ? end : windowEnd;
      if (to > from) {
        total += (to.getTime() - from.getTime()) / 3_600_000;
      }
    }
    // Advance to next calendar day at midnight.
    cursor.setHours(24, 0, 0, 0);
  }
  return Math.min(total, HOURS_PER_DAY * 3650); // hard cap to avoid runaway
}

function elapsedHours(start: Date, end: Date, businessHoursOnly: boolean): number {
  if (businessHoursOnly) return businessHoursBetween(start, end);
  return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000);
}

/** Map a trigger type like `deal.stage_changed` to an entity type (`deal`). */
function entityTypeFromTrigger(triggerType: string): string {
  const dot = triggerType.indexOf('.');
  return (dot > 0 ? triggerType.slice(0, dot) : triggerType).toLowerCase();
}

/** Best-effort extraction of the entity id from a trigger payload. */
function entityIdFromPayload(payload: Record<string, unknown>, entityType: string): string | null {
  const candidates = [
    `${entityType}Id`,
    'entityId',
    'id',
    'recordId',
    'dealId',
    'leadId',
    'ticketId',
  ];
  for (const key of candidates) {
    const v = payload[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  // Nested entity object, e.g. { deal: { id } }.
  const nested = payload[entityType];
  if (nested && typeof nested === 'object') {
    const id = (nested as Record<string, unknown>).id;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return null;
}

/**
 * Best-effort owner extraction from a trigger payload so `sla.breached` can name
 * the person to nudge. Checks common owner keys then a nested entity object.
 */
function ownerIdFromPayload(payload: Record<string, unknown>, entityType: string): string | null {
  for (const key of ['ownerId', 'assigneeId', 'assignedTo', 'userId']) {
    const v = payload[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  const nested = payload[entityType];
  if (nested && typeof nested === 'object') {
    const o = (nested as Record<string, unknown>).ownerId;
    if (typeof o === 'string' && o.length > 0) return o;
  }
  return null;
}

export function createSlaService(prisma: WorkflowPrisma, producer?: NexusProducer) {
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

        // No open breach row yet — compute elapsed time ON DEMAND from the same
        // SLA clock the background scanner uses (the in-flight workflow
        // execution's startedAt for this entity), rather than assuming
        // within-SLA. Previously this branch did nothing, so a live SLA_CHECK
        // node / /sla/check only ever reported breaches the scanner had already
        // written — it could never catch one first.
        let executions: Array<{ triggerType: string; triggerPayload: unknown; startedAt: Date }>;
        try {
          executions = await prisma.workflowExecution.findMany({
            where: {
              tenantId,
              status: { in: ['RUNNING', 'PAUSED'] },
              triggerType: { startsWith: def.entityType },
            },
            select: { triggerType: true, triggerPayload: true, startedAt: true },
            take: 500,
          });
        } catch {
          continue; // DB hiccup — can't assert a breach for this SLA; skip.
        }

        let startedAt: Date | null = null;
        for (const exec of executions) {
          const et = entityTypeFromTrigger(exec.triggerType);
          if (et !== def.entityType.toLowerCase()) continue;
          const pid = entityIdFromPayload((exec.triggerPayload ?? {}) as Record<string, unknown>, et);
          if (pid === entityId && (!startedAt || exec.startedAt < startedAt)) {
            startedAt = exec.startedAt; // earliest matching execution = clock start
          }
        }
        if (!startedAt) continue; // no resolvable clock — cannot assert a breach.

        const hoursElapsed = elapsedHours(startedAt, new Date(), def.businessHoursOnly);
        if (hoursElapsed >= def.timeLimitHours) {
          breaches.push({
            slaId: def.id,
            slaName: def.name,
            entityId,
            entityType,
            hoursElapsed: Math.round(hoursElapsed * 100) / 100,
            hoursAllowed: def.timeLimitHours,
          });
        }
      }

      return {
        withinSla: breaches.length === 0,
        breaches,
      };
    },

    /**
     * Scan all active SLA definitions across tenants and record/escalate
     * breaches. Called on a timer by the SLA scanner poller.
     *
     * Timestamp source (pragmatic, in-service): each active SLA's tracked
     * entities are inferred from in-flight WorkflowExecutions (RUNNING/PAUSED)
     * whose triggerType matches the SLA's entityType. The execution's
     * `startedAt` is the SLA clock start. We compute elapsed time (business
     * hours honored) and compare to `timeLimitHours`.
     *
     * We cannot see raw CRM stage-entry timestamps from here, so when an
     * execution carries no resolvable entity id we skip it rather than fail.
     *
     * Idempotency: a breach is keyed by (tenantId, slaId, entityId). If an
     * open breach (BREACHED/ESCALATED) already exists we escalate at most once
     * per multiple of the time limit, never creating duplicate rows.
     */
    async scanBreaches(now: Date = new Date()): Promise<{ created: number; escalated: number; scanned: number }> {
      let created = 0;
      let escalated = 0;
      let scanned = 0;

      const definitions = await prisma.slaDefinition.findMany({
        where: { isActive: true },
        take: 500,
      });

      for (const def of definitions) {
        // In-flight executions this SLA could apply to (same tenant + entity type).
        let executions: Array<{
          id: string;
          triggerType: string;
          triggerPayload: unknown;
          startedAt: Date;
        }>;
        try {
          executions = await prisma.workflowExecution.findMany({
            where: {
              tenantId: def.tenantId,
              status: { in: ['RUNNING', 'PAUSED'] },
              triggerType: { startsWith: def.entityType },
            },
            select: { id: true, triggerType: true, triggerPayload: true, startedAt: true },
            take: 500,
          });
        } catch {
          continue; // DB hiccup for this definition — skip, don't abort the scan.
        }

        for (const exec of executions) {
          const entityType = entityTypeFromTrigger(exec.triggerType);
          if (entityType !== def.entityType.toLowerCase()) continue;
          const payload = (exec.triggerPayload ?? {}) as Record<string, unknown>;
          const entityId = entityIdFromPayload(payload, entityType);
          if (!entityId) continue; // no resolvable entity id — skip, guarded.

          scanned++;
          const hoursElapsed = elapsedHours(exec.startedAt, now, def.businessHoursOnly);
          if (hoursElapsed < def.timeLimitHours) continue; // within SLA.

          try {
            const existing = await prisma.slaBreach.findFirst({
              where: {
                tenantId: def.tenantId,
                slaId: def.id,
                entityId,
                status: { in: ['BREACHED', 'ESCALATED'] },
              },
            });

            if (!existing) {
              await prisma.slaBreach.create({
                data: {
                  tenantId: def.tenantId,
                  slaId: def.id,
                  entityId,
                  entityType,
                  status: 'BREACHED',
                  metadata: {
                    hoursElapsed: Math.round(hoursElapsed * 100) / 100,
                    hoursAllowed: def.timeLimitHours,
                    executionId: exec.id,
                    detectedAt: now.toISOString(),
                  } as object,
                },
              });
              created++;
              // Emit `sla.breached` so notification-service can alert the owner
              // (NOT-03). The row previously landed silently. Fail-open: a Kafka
              // hiccup must never abort the scan or lose the recorded breach.
              if (producer) {
                await producer
                  .publish(TOPICS.WORKFLOWS, {
                    type: 'sla.breached',
                    tenantId: def.tenantId,
                    payload: {
                      tenantId: def.tenantId,
                      slaId: def.id,
                      slaName: def.name,
                      entityType,
                      entityId,
                      ownerId: ownerIdFromPayload(payload, entityType) ?? undefined,
                      hoursElapsed: Math.round(hoursElapsed * 100) / 100,
                      hoursAllowed: def.timeLimitHours,
                      executionId: exec.id,
                      detectedAt: now.toISOString(),
                    },
                  })
                  .catch(() => undefined);
              }
              continue;
            }

            // Escalate at most once per additional full time-limit window since
            // the breach was first recorded. escalationLevel starts at 1.
            const overdueMultiple = Math.floor(hoursElapsed / def.timeLimitHours);
            if (overdueMultiple > existing.escalationLevel && existing.status !== 'RESOLVED') {
              await prisma.slaBreach.update({
                where: { id: existing.id },
                data: { status: 'ESCALATED', escalationLevel: { increment: 1 } },
              });
              escalated++;
            }
          } catch {
            // Per-entity failure must not abort the whole scan.
            continue;
          }
        }
      }

      return { created, escalated, scanned };
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
