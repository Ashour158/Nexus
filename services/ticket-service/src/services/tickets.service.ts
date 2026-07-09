import type { NexusProducer } from '@nexus/kafka';
import { BusinessRuleError } from '@nexus/service-utils';
import type { TicketPrisma } from '../prisma.js';
import { canTransition, isReopen, type TicketStatus } from '../lib/state-machine.js';

/** Domain topic for ticket events (no CRM topic fits; use a dedicated one). */
export const TICKET_TOPIC = 'nexus.ticket.events';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type Channel = 'EMAIL' | 'WEB' | 'PHONE' | 'CHAT' | 'API';

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

export function createTicketsService(prisma: TicketPrisma, producer: NexusProducer) {
  /** Fire-and-forget domain event. Never throws into the caller. */
  async function emit(tenantId: string, type: string, payload: Record<string, unknown>) {
    await producer
      .publish(TICKET_TOPIC, { type, tenantId, payload })
      .catch((err) => console.warn(`[tickets] event ${type} publish failed:`, (err as Error)?.message));
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

  /** Resolve the SLA policy that governs a given priority (specific → default). */
  async function resolveSlaPolicy(tenantId: string, priority: Priority) {
    const byPriority = await prisma.slaPolicy.findFirst({
      where: { tenantId, active: true, priority: priority as any },
      orderBy: { createdAt: 'asc' },
    });
    if (byPriority) return byPriority;
    return prisma.slaPolicy.findFirst({
      where: { tenantId, active: true, isDefault: true },
      orderBy: { createdAt: 'asc' },
    });
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
      const policy = await resolveSlaPolicy(tenantId, priority);
      const now = new Date();
      const firstResponseDueAt = policy
        ? new Date(now.getTime() + policy.firstResponseMins * 60_000)
        : null;
      const resolutionDueAt = policy
        ? new Date(now.getTime() + policy.resolutionMins * 60_000)
        : null;

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
            accountId: input.accountId ?? null,
            assigneeId: input.assigneeId ?? null,
            teamId: input.teamId ?? null,
            slaPolicyId: policy?.id ?? null,
            firstResponseDueAt,
            resolutionDueAt,
            tags: input.tags ?? [],
            customFields: (input.customFields ?? {}) as any,
          },
        });
        await record(tx as any, tenantId, created.id, 'created', actorId, {
          number: created.number,
          priority,
        });
        return created;
      });

      await emit(tenantId, 'ticket.created', {
        ticketId: ticket.id,
        number: ticket.number,
        priority: ticket.priority,
        assigneeId: ticket.assigneeId,
        accountId: ticket.accountId,
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

      // A priority change re-derives SLA targets from the matching policy.
      let slaFields: Record<string, unknown> = {};
      if (patch.priority && patch.priority !== existing.priority) {
        const policy = await resolveSlaPolicy(tenantId, patch.priority);
        if (policy) {
          const base = existing.createdAt.getTime();
          slaFields = {
            slaPolicyId: policy.id,
            firstResponseDueAt: new Date(base + policy.firstResponseMins * 60_000),
            resolutionDueAt: new Date(base + policy.resolutionMins * 60_000),
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
     * Scan open tickets whose SLA target has elapsed, flag them, and emit a
     * `ticket.sla.breached` event once per newly breached ticket. Runs from a
     * poller with NO tenant context, so it must not rely on tenant injection —
     * every query is explicit and cross-tenant by design.
     */
    async evaluateSlaBreaches(): Promise<number> {
      const now = new Date();
      const candidates = await prisma.ticket.findMany({
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
      });
      let flagged = 0;
      for (const t of candidates) {
        try {
          await prisma.ticket.update({ where: { id: t.id }, data: { slaBreached: true } });
          await prisma.ticketEvent.create({
            data: { tenantId: t.tenantId, ticketId: t.id, type: 'sla_breached', actorId: null, data: {} },
          });
          await emit(t.tenantId, 'ticket.sla.breached', {
            ticketId: t.id,
            number: t.number,
            firstResponseDueAt: t.firstResponseDueAt,
            resolutionDueAt: t.resolutionDueAt,
          });
          flagged++;
        } catch (err) {
          console.warn('[tickets.sla] flag failed:', (err as Error)?.message);
        }
      }
      return flagged;
    },
  };
}

export type TicketsService = ReturnType<typeof createTicketsService>;
