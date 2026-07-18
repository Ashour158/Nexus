import { TOPICS, type NexusProducer } from '@nexus/kafka';
import { BusinessRuleError } from '@nexus/service-utils';
import type { TicketPrisma } from '../prisma.js';
import { canTransition, isReopen, type TicketStatus } from '../lib/state-machine.js';
import { computeDueDate } from '../lib/business-hours.js';

/** Domain topic for ticket events (no CRM topic fits; use a dedicated one). */
export const TICKET_TOPIC = 'nexus.ticket.events';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type Channel = 'EMAIL' | 'WEB' | 'PHONE' | 'CHAT' | 'API';
type SupportLevel = 'BASIC' | 'STANDARD' | 'PREMIUM';

/** Minutes-before-a-due-date a still-open ticket is flagged "at risk". */
const AT_RISK_MINS = Math.max(1, parseInt(process.env.SLA_AT_RISK_MINS ?? '60', 10) || 60);

export interface TicketListFilters {
  status?: TicketStatus;
  priority?: Priority;
  assigneeId?: string;
  accountId?: string;
  requesterContactId?: string;
  requesterEmail?: string;
  teamId?: string;
  search?: string;
  page: number;
  limit: number;
}

export interface CreateTicketInput {
  subject: string;
  description?: string;
  priority?: Priority;
  type?: string;
  channel?: Channel;
  requesterContactId?: string;
  requesterEmail?: string;
  accountId?: string;
  assigneeId?: string;
  teamId?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

export interface EntitlementInput {
  accountId: string;
  name: string;
  supportLevel?: SupportLevel;
  startAt?: Date;
  endAt?: Date | null;
  remainingUnits?: number | null;
  isActive?: boolean;
}

/**
 * @param prisma    tenant-extended client (all request-scoped work).
 * @param producer  Kafka producer for domain + notification events.
 * @param rawPrisma non-tenant-extended client used ONLY by the cross-tenant SLA
 *                  breach sweep; defaults to `prisma` so tests can pass one arg.
 */
export function createTicketsService(
  prisma: TicketPrisma,
  producer: NexusProducer,
  rawPrisma: TicketPrisma = prisma
) {
  /** Fire-and-forget domain event. Never throws into the caller. */
  async function emit(tenantId: string, type: string, payload: Record<string, unknown>) {
    await producer
      .publish(TICKET_TOPIC, { type, tenantId, payload })
      .catch((err) => console.warn(`[tickets] event ${type} publish failed:`, (err as Error)?.message));
  }

  /**
   * Fire a `notification.requested` event on the platform notifications topic —
   * the same contract workflow-service uses — so notification-service persists an
   * in-app row and fans out per the recipient's channel prefs. Never throws.
   */
  async function requestNotification(
    tenantId: string,
    recipientId: string,
    notificationType: string,
    title: string,
    body: string,
    entityId: string,
    metadata: Record<string, unknown> = {}
  ) {
    if (!recipientId) return;
    await producer
      .publish(TOPICS.NOTIFICATIONS, {
        type: 'notification.requested',
        tenantId,
        payload: {
          channel: 'in_app',
          recipientId,
          notificationType,
          title,
          body,
          actionUrl: `/support/tickets/${entityId}`,
          entityType: 'ticket',
          entityId,
          metadata,
        },
      })
      .catch((err) =>
        console.warn(`[tickets] notification ${notificationType} publish failed:`, (err as Error)?.message)
      );
  }

  /** Append an immutable history row. */
  async function record(
    tx: TicketPrisma,
    tenantId: string,
    ticketId: string,
    type: string,
    actorId: string | undefined,
    data: Record<string, unknown> = {}
  ) {
    await tx.ticketEvent.create({
      data: { tenantId, ticketId, type, actorId: actorId ?? null, data: data as any },
    });
  }

  /**
   * Resolve the SLA policy governing a ticket, most-specific first:
   *   1. tier + priority   (e.g. PREMIUM + URGENT)
   *   2. tier only         (any priority for that tier)
   *   3. priority only     (tier-agnostic policy for that priority)
   *   4. tenant default
   * A higher entitlement tier therefore pulls a tighter policy when one exists.
   */
  async function resolveSlaPolicy(
    tenantId: string,
    priority: Priority,
    supportLevel: SupportLevel | null
  ) {
    if (supportLevel) {
      const tierPriority = await prisma.slaPolicy.findFirst({
        where: { tenantId, active: true, supportLevel: supportLevel as any, priority: priority as any },
        orderBy: { createdAt: 'asc' },
      });
      if (tierPriority) return tierPriority;
      const tierOnly = await prisma.slaPolicy.findFirst({
        where: { tenantId, active: true, supportLevel: supportLevel as any, priority: null },
        orderBy: { createdAt: 'asc' },
      });
      if (tierOnly) return tierOnly;
    }
    const byPriority = await prisma.slaPolicy.findFirst({
      where: { tenantId, active: true, supportLevel: null, priority: priority as any },
      orderBy: { createdAt: 'asc' },
    });
    if (byPriority) return byPriority;
    return prisma.slaPolicy.findFirst({
      where: { tenantId, active: true, isDefault: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** The account's current, in-window, active entitlement (if any). */
  async function resolveActiveEntitlement(tenantId: string, accountId: string | null) {
    if (!accountId) return null;
    const now = new Date();
    return prisma.entitlement.findFirst({
      where: {
        tenantId,
        accountId,
        isActive: true,
        startAt: { lte: now },
        OR: [{ endAt: null }, { endAt: { gte: now } }],
      },
      // Highest tier first (PREMIUM > STANDARD > BASIC), then freshest.
      orderBy: [{ supportLevel: 'desc' }, { startAt: 'desc' }],
    });
  }

  /** Compute first-response + resolution due dates from a policy (business-hours aware). */
  function dueDates(policy: { firstResponseMins: number; resolutionMins: number; businessHoursOnly: boolean } | null, from: Date) {
    if (!policy) return { firstResponseDueAt: null as Date | null, resolutionDueAt: null as Date | null };
    return {
      firstResponseDueAt: computeDueDate(from, policy.firstResponseMins, policy.businessHoursOnly),
      resolutionDueAt: computeDueDate(from, policy.resolutionMins, policy.businessHoursOnly),
    };
  }

  /** Format a per-tenant sequence integer into a display number (TKT-000123). */
  function formatNumber(seq: number): string {
    return `TKT-${String(seq).padStart(6, '0')}`;
  }

  /** True when a ticket has blown a still-open SLA target. */
  function computeBreached(t: {
    status: string;
    firstRespondedAt: Date | null;
    firstResponseDueAt: Date | null;
    resolvedAt: Date | null;
    resolutionDueAt: Date | null;
  }): boolean {
    const now = Date.now();
    const frBreached =
      !!t.firstResponseDueAt && !t.firstRespondedAt && t.firstResponseDueAt.getTime() < now;
    const resBreached =
      !!t.resolutionDueAt &&
      !t.resolvedAt &&
      t.status !== 'RESOLVED' &&
      t.status !== 'CLOSED' &&
      t.resolutionDueAt.getTime() < now;
    return frBreached || resBreached;
  }

  return {
    async listTickets(tenantId: string, f: TicketListFilters) {
      const where: Record<string, unknown> = { tenantId, deletedAt: null };
      if (f.status) where.status = f.status;
      if (f.priority) where.priority = f.priority;
      if (f.assigneeId) where.assigneeId = f.assigneeId;
      if (f.accountId) where.accountId = f.accountId;
      if (f.requesterContactId) where.requesterContactId = f.requesterContactId;
      if (f.requesterEmail) where.requesterEmail = f.requesterEmail;
      if (f.teamId) where.teamId = f.teamId;
      if (f.search) {
        where.OR = [
          { subject: { contains: f.search, mode: 'insensitive' } },
          { description: { contains: f.search, mode: 'insensitive' } },
          { number: { contains: f.search, mode: 'insensitive' } },
        ];
      }
      const [rows, total] = await Promise.all([
        prisma.ticket.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }],
          skip: (f.page - 1) * f.limit,
          take: f.limit,
        }),
        prisma.ticket.count({ where }),
      ]);
      const data = rows.map((t) => ({ ...t, slaBreached: t.slaBreached || computeBreached(t) }));
      return { data, total, page: f.page, limit: f.limit };
    },

    async getTicket(tenantId: string, id: string) {
      const t = await prisma.ticket.findFirst({ where: { tenantId, id, deletedAt: null } });
      if (!t) return null;
      return { ...t, slaBreached: t.slaBreached || computeBreached(t) };
    },

    async createTicket(tenantId: string, actorId: string | undefined, input: CreateTicketInput) {
      const priority = input.priority ?? 'MEDIUM';
      const accountId = input.accountId ?? null;
      // Resolve the account's support entitlement, then let its tier steer SLA
      // policy selection (PREMIUM accounts can pull a tighter policy).
      const entitlement = await resolveActiveEntitlement(tenantId, accountId);
      const supportLevel = (entitlement?.supportLevel ?? null) as SupportLevel | null;
      const policy = await resolveSlaPolicy(tenantId, priority, supportLevel);
      const now = new Date();
      const { firstResponseDueAt, resolutionDueAt } = dueDates(policy, now);

      const ticket = await prisma.$transaction(async (tx) => {
        // Atomic, gapless per-tenant sequence.
        const counter = await tx.ticketCounter.upsert({
          where: { tenantId },
          create: { tenantId, lastNumber: 1 },
          update: { lastNumber: { increment: 1 } },
        });
        const created = await tx.ticket.create({
          data: {
            tenantId,
            number: formatNumber(counter.lastNumber),
            subject: input.subject,
            description: input.description ?? null,
            priority: priority as any,
            type: input.type ?? null,
            channel: (input.channel ?? 'WEB') as any,
            requesterContactId: input.requesterContactId ?? null,
            requesterEmail: input.requesterEmail ?? null,
            accountId,
            assigneeId: input.assigneeId ?? null,
            teamId: input.teamId ?? null,
            slaPolicyId: policy?.id ?? null,
            entitlementId: entitlement?.id ?? null,
            supportLevel: supportLevel as any,
            firstResponseDueAt,
            resolutionDueAt,
            tags: input.tags ?? [],
            customFields: (input.customFields ?? {}) as any,
          },
        });
        await record(tx as any, tenantId, created.id, 'created', actorId, {
          number: created.number,
          priority,
          slaPolicyId: policy?.id ?? null,
          entitlementId: entitlement?.id ?? null,
          supportLevel,
        });
        return created;
      });

      await emit(tenantId, 'ticket.created', {
        ticketId: ticket.id,
        number: ticket.number,
        priority: ticket.priority,
        assigneeId: ticket.assigneeId,
        accountId: ticket.accountId,
        slaPolicyId: ticket.slaPolicyId,
        entitlementId: ticket.entitlementId,
        supportLevel: ticket.supportLevel,
      });
      return ticket;
    },

    async updateTicket(
      tenantId: string,
      id: string,
      actorId: string | undefined,
      patch: Partial<{
        subject: string;
        description: string | null;
        priority: Priority;
        type: string | null;
        tags: string[];
        customFields: Record<string, unknown>;
        requesterContactId: string | null;
        requesterEmail: string | null;
        accountId: string | null;
      }>
    ) {
      const existing = await prisma.ticket.findFirst({ where: { tenantId, id, deletedAt: null } });
      if (!existing) return null;

      // A priority change re-derives SLA targets from the matching policy,
      // honouring the ticket's already-stamped entitlement tier and keeping
      // due-date math business-hours aware. Recomputing due dates also clears a
      // prior breach flag so the fresh clock can be re-evaluated by the poller.
      let slaFields: Record<string, unknown> = {};
      if (patch.priority && patch.priority !== existing.priority) {
        const policy = await resolveSlaPolicy(
          tenantId,
          patch.priority,
          (existing.supportLevel ?? null) as SupportLevel | null
        );
        if (policy) {
          const { firstResponseDueAt, resolutionDueAt } = dueDates(policy, existing.createdAt);
          slaFields = {
            slaPolicyId: policy.id,
            firstResponseDueAt,
            resolutionDueAt,
            slaBreached: false,
            firstResponseBreached: false,
            resolutionBreached: false,
          };
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        const t = await tx.ticket.update({
          where: { id },
          data: {
            subject: patch.subject,
            description: patch.description,
            priority: patch.priority as any,
            type: patch.type,
            tags: patch.tags,
            customFields: patch.customFields as any,
            requesterContactId: patch.requesterContactId,
            requesterEmail: patch.requesterEmail,
            accountId: patch.accountId,
            ...slaFields,
          },
        });
        await record(tx as any, tenantId, id, 'updated', actorId, { fields: Object.keys(patch) });
        return t;
      });

      await emit(tenantId, 'ticket.updated', { ticketId: id, fields: Object.keys(patch) });
      return updated;
    },

    async softDelete(tenantId: string, id: string, actorId: string | undefined) {
      const res = await prisma.ticket.updateMany({
        where: { tenantId, id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (res.count === 0) return false;
      await prisma.ticketEvent.create({
        data: { tenantId, ticketId: id, type: 'deleted', actorId: actorId ?? null, data: {} },
      });
      await emit(tenantId, 'ticket.updated', { ticketId: id, deleted: true });
      return true;
    },

    async restore(tenantId: string, id: string, actorId: string | undefined) {
      const res = await prisma.ticket.updateMany({
        where: { tenantId, id, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      if (res.count === 0) return false;
      await prisma.ticketEvent.create({
        data: { tenantId, ticketId: id, type: 'restored', actorId: actorId ?? null, data: {} },
      });
      await emit(tenantId, 'ticket.updated', { ticketId: id, restored: true });
      return true;
    },

    async assign(
      tenantId: string,
      id: string,
      actorId: string | undefined,
      target: { assigneeId?: string | null; teamId?: string | null }
    ) {
      const existing = await prisma.ticket.findFirst({ where: { tenantId, id, deletedAt: null } });
      if (!existing) return null;
      // `undefined` = leave untouched; explicit null/'' = clear (unassign).
      const nextAssignee =
        target.assigneeId !== undefined ? target.assigneeId || null : existing.assigneeId;
      const nextTeam = target.teamId !== undefined ? target.teamId || null : existing.teamId;
      const updated = await prisma.$transaction(async (tx) => {
        const t = await tx.ticket.update({
          where: { id },
          data: {
            assigneeId: nextAssignee,
            teamId: nextTeam,
          },
        });
        await record(tx as any, tenantId, id, 'assigned', actorId, {
          assigneeId: nextAssignee,
          teamId: nextTeam,
        });
        return t;
      });
      await emit(tenantId, 'ticket.assigned', {
        ticketId: id,
        assigneeId: updated.assigneeId,
        teamId: updated.teamId,
      });
      return updated;
    },

    async transition(tenantId: string, id: string, actorId: string | undefined, to: TicketStatus) {
      const existing = await prisma.ticket.findFirst({ where: { tenantId, id, deletedAt: null } });
      if (!existing) return null;
      const from = existing.status as TicketStatus;
      if (!canTransition(from, to)) {
        throw new BusinessRuleError(`Invalid ticket transition ${from} → ${to}`, {
          from,
          to,
        });
      }

      const reopen = isReopen(from, to);
      const now = new Date();
      const data: Record<string, unknown> = { status: to as any };
      if (reopen) {
        data.reopenCount = { increment: 1 };
        data.resolvedAt = null;
        data.closedAt = null;
      } else {
        if (to === 'RESOLVED') data.resolvedAt = now;
        if (to === 'CLOSED') {
          data.closedAt = now;
          if (!existing.resolvedAt) data.resolvedAt = now;
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        const t = await tx.ticket.update({ where: { id }, data });
        await record(tx as any, tenantId, id, 'status_changed', actorId, { from, to, reopen });
        return t;
      });

      await emit(tenantId, 'ticket.status_changed', { ticketId: id, from, to });
      if (reopen) await emit(tenantId, 'ticket.reopened', { ticketId: id, reopenCount: updated.reopenCount });
      if (to === 'RESOLVED') await emit(tenantId, 'ticket.resolved', { ticketId: id });
      if (to === 'CLOSED') await emit(tenantId, 'ticket.closed', { ticketId: id });
      return updated;
    },

    async listComments(tenantId: string, id: string, includeInternal: boolean) {
      const ticket = await prisma.ticket.findFirst({ where: { tenantId, id, deletedAt: null } });
      if (!ticket) return null;
      return prisma.ticketComment.findMany({
        where: { tenantId, ticketId: id, ...(includeInternal ? {} : { isInternal: false }) },
        orderBy: { createdAt: 'asc' },
      });
    },

    async addComment(
      tenantId: string,
      id: string,
      authorId: string,
      body: string,
      isInternal: boolean
    ) {
      const ticket = await prisma.ticket.findFirst({ where: { tenantId, id, deletedAt: null } });
      if (!ticket) return null;

      const result = await prisma.$transaction(async (tx) => {
        const comment = await tx.ticketComment.create({
          data: { tenantId, ticketId: id, authorId, body, isInternal },
        });
        // First public (agent) response stamps firstRespondedAt.
        const stampFirstResponse = !isInternal && !ticket.firstRespondedAt;
        if (stampFirstResponse) {
          await tx.ticket.update({
            where: { id },
            data: { firstRespondedAt: comment.createdAt },
          });
        }
        await record(tx as any, tenantId, id, 'comment_added', authorId, {
          commentId: comment.id,
          isInternal,
        });
        return { comment, stampedFirstResponse: stampFirstResponse };
      });

      await emit(tenantId, 'ticket.comment_added', {
        ticketId: id,
        commentId: result.comment.id,
        isInternal,
      });
      return result.comment;
    },

    async listHistory(tenantId: string, id: string) {
      const ticket = await prisma.ticket.findFirst({ where: { tenantId, id, deletedAt: null } });
      if (!ticket) return null;
      return prisma.ticketEvent.findMany({
        where: { tenantId, ticketId: id },
        orderBy: { createdAt: 'asc' },
      });
    },

    // ── SLA policy admin ──────────────────────────────────────────────────────
    async listPolicies(tenantId: string) {
      return prisma.slaPolicy.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
    },

    async createPolicy(
      tenantId: string,
      input: {
        name: string;
        priority?: Priority | null;
        supportLevel?: SupportLevel | null;
        firstResponseMins: number;
        resolutionMins: number;
        businessHoursOnly?: boolean;
        isDefault?: boolean;
        active?: boolean;
      }
    ) {
      return prisma.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.slaPolicy.updateMany({ where: { tenantId, isDefault: true }, data: { isDefault: false } });
        }
        return tx.slaPolicy.create({
          data: {
            tenantId,
            name: input.name,
            priority: (input.priority ?? null) as any,
            supportLevel: (input.supportLevel ?? null) as any,
            firstResponseMins: input.firstResponseMins,
            resolutionMins: input.resolutionMins,
            businessHoursOnly: input.businessHoursOnly ?? false,
            isDefault: input.isDefault ?? false,
            active: input.active ?? true,
          },
        });
      });
    },

    async updatePolicy(
      tenantId: string,
      id: string,
      patch: Partial<{
        name: string;
        priority: Priority | null;
        supportLevel: SupportLevel | null;
        firstResponseMins: number;
        resolutionMins: number;
        businessHoursOnly: boolean;
        isDefault: boolean;
        active: boolean;
      }>
    ) {
      const existing = await prisma.slaPolicy.findFirst({ where: { tenantId, id } });
      if (!existing) return null;
      return prisma.$transaction(async (tx) => {
        if (patch.isDefault) {
          await tx.slaPolicy.updateMany({
            where: { tenantId, isDefault: true, NOT: { id } },
            data: { isDefault: false },
          });
        }
        return tx.slaPolicy.update({
          where: { id },
          data: {
            name: patch.name,
            priority: patch.priority as any,
            supportLevel: patch.supportLevel as any,
            firstResponseMins: patch.firstResponseMins,
            resolutionMins: patch.resolutionMins,
            businessHoursOnly: patch.businessHoursOnly,
            isDefault: patch.isDefault,
            active: patch.active,
          },
        });
      });
    },

    async deletePolicy(tenantId: string, id: string) {
      const res = await prisma.slaPolicy.deleteMany({ where: { tenantId, id } });
      return res.count > 0;
    },

    /**
     * SLA breach sweep. Scans open tickets whose first-response or resolution
     * target has elapsed while still unmet, ACROSS ALL TENANTS, marks them
     * breached (idempotent claim), records history, and fires two things per
     * newly-breached ticket:
     *   - a `ticket.sla.breached` domain event, and
     *   - a `notification.requested` escalation to the assignee (if any).
     *
     * Runs from a poller with NO tenant in AsyncLocalStorage, so it uses the RAW
     * (non-tenant-extended) client and pins every write with the row's own
     * `tenantId` — a tenant-scoped client would fail-closed here.
     */
    async evaluateSlaBreaches(): Promise<number> {
      const now = new Date();
      const candidates = await rawPrisma.ticket.findMany({
        where: {
          deletedAt: null,
          slaBreached: false,
          status: { notIn: ['RESOLVED' as any, 'CLOSED' as any] },
          OR: [
            { firstRespondedAt: null, firstResponseDueAt: { lt: now } },
            { resolvedAt: null, resolutionDueAt: { lt: now } },
          ],
        },
        take: 500,
        orderBy: { createdAt: 'asc' },
      });
      let flagged = 0;
      for (const t of candidates) {
        const firstResponseBreached =
          !!t.firstResponseDueAt && !t.firstRespondedAt && t.firstResponseDueAt.getTime() < now.getTime();
        const resolutionBreached =
          !!t.resolutionDueAt && !t.resolvedAt && t.resolutionDueAt.getTime() < now.getTime();
        try {
          // Idempotent claim: only the update that flips slaBreached false→true
          // proceeds, so overlapping sweeps can't double-escalate.
          const claim = await rawPrisma.ticket.updateMany({
            where: { id: t.id, tenantId: t.tenantId, slaBreached: false },
            data: { slaBreached: true, firstResponseBreached, resolutionBreached },
          });
          if (claim.count === 0) continue;

          const breachType = firstResponseBreached ? 'first_response' : 'resolution';
          await rawPrisma.ticketEvent.create({
            data: {
              tenantId: t.tenantId,
              ticketId: t.id,
              type: 'sla_breached',
              actorId: null,
              data: { breachType, firstResponseBreached, resolutionBreached } as any,
            },
          });
          await emit(t.tenantId, 'ticket.sla.breached', {
            ticketId: t.id,
            number: t.number,
            breachType,
            firstResponseBreached,
            resolutionBreached,
            firstResponseDueAt: t.firstResponseDueAt,
            resolutionDueAt: t.resolutionDueAt,
            assigneeId: t.assigneeId,
          });
          // Escalation: nudge the assignee so the breach is actioned.
          await requestNotification(
            t.tenantId,
            t.assigneeId ?? '',
            'ticket.sla.breached',
            `SLA breached: ${t.number}`,
            `Ticket ${t.number} (${t.priority}) breached its ${breachType.replace('_', ' ')} SLA.`,
            t.id,
            { breachType, number: t.number, priority: t.priority }
          );
          flagged++;
        } catch (err) {
          console.warn('[tickets.sla] flag failed:', (err as Error)?.message);
        }
      }
      return flagged;
    },

    /**
     * Queue view for the SLA dashboard.
     *   - `breached`: SLA already blown (flag set OR computed past-due).
     *   - `at_risk` : still within SLA but a due date lands inside AT_RISK_MINS.
     */
    async getSlaStatus(tenantId: string, kind: 'at_risk' | 'breached', limit = 100) {
      const now = new Date();
      if (kind === 'breached') {
        const rows = await prisma.ticket.findMany({
          where: {
            tenantId,
            deletedAt: null,
            status: { notIn: ['RESOLVED' as any, 'CLOSED' as any] },
            OR: [
              { slaBreached: true },
              { firstRespondedAt: null, firstResponseDueAt: { lt: now } },
              { resolvedAt: null, resolutionDueAt: { lt: now } },
            ],
          },
          orderBy: [{ priority: 'desc' }, { resolutionDueAt: 'asc' }],
          take: limit,
        });
        return rows.map((t) => ({ ...t, slaBreached: true }));
      }
      // at_risk: not yet breached, but a live due date is within the window.
      const soon = new Date(now.getTime() + AT_RISK_MINS * 60_000);
      const rows = await prisma.ticket.findMany({
        where: {
          tenantId,
          deletedAt: null,
          slaBreached: false,
          status: { notIn: ['RESOLVED' as any, 'CLOSED' as any] },
          OR: [
            { firstRespondedAt: null, firstResponseDueAt: { gte: now, lte: soon } },
            { resolvedAt: null, resolutionDueAt: { gte: now, lte: soon } },
          ],
        },
        orderBy: [{ priority: 'desc' }, { firstResponseDueAt: 'asc' }],
        take: limit,
      });
      return rows;
    },

    // ── Entitlements ──────────────────────────────────────────────────────────
    async listEntitlements(tenantId: string, accountId?: string) {
      return prisma.entitlement.findMany({
        where: { tenantId, ...(accountId ? { accountId } : {}) },
        orderBy: { createdAt: 'desc' },
      });
    },

    async getEntitlement(tenantId: string, id: string) {
      return prisma.entitlement.findFirst({ where: { tenantId, id } });
    },

    async createEntitlement(tenantId: string, input: EntitlementInput) {
      return prisma.entitlement.create({
        data: {
          tenantId,
          accountId: input.accountId,
          name: input.name,
          supportLevel: (input.supportLevel ?? 'STANDARD') as any,
          startAt: input.startAt ?? new Date(),
          endAt: input.endAt ?? null,
          remainingUnits: input.remainingUnits ?? null,
          isActive: input.isActive ?? true,
        },
      });
    },

    async updateEntitlement(
      tenantId: string,
      id: string,
      patch: Partial<{
        name: string;
        supportLevel: SupportLevel;
        startAt: Date;
        endAt: Date | null;
        remainingUnits: number | null;
        isActive: boolean;
      }>
    ) {
      const existing = await prisma.entitlement.findFirst({ where: { tenantId, id } });
      if (!existing) return null;
      return prisma.entitlement.update({
        where: { id },
        data: {
          name: patch.name,
          supportLevel: patch.supportLevel as any,
          startAt: patch.startAt,
          endAt: patch.endAt,
          remainingUnits: patch.remainingUnits,
          isActive: patch.isActive,
        },
      });
    },

    async deleteEntitlement(tenantId: string, id: string) {
      const res = await prisma.entitlement.deleteMany({ where: { tenantId, id } });
      return res.count > 0;
    },

    /**
     * Coverage check for an account: returns the active entitlement (if any) and
     * whether support is currently covered (active, in-window, units remaining).
     */
    async checkEntitlement(tenantId: string, accountId: string) {
      const entitlement = await resolveActiveEntitlement(tenantId, accountId);
      const covered =
        !!entitlement && (entitlement.remainingUnits === null || entitlement.remainingUnits > 0);
      return {
        accountId,
        covered,
        supportLevel: entitlement?.supportLevel ?? null,
        entitlement: entitlement ?? null,
      };
    },
  };
}

export type TicketsService = ReturnType<typeof createTicketsService>;
