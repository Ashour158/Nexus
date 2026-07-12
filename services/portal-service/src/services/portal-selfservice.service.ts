import type { NexusProducer } from '@nexus/kafka';
import type { PortalPrisma } from '../prisma.js';
import type { PortalSession } from '../lib/portal-auth.js';
import {
  emitPartnerDealRegistered,
  emitPortalCaseComment,
  emitPortalCaseSubmitted,
} from './portal-events.js';

/**
 * Self-service + sharing surface for external portal identities (Zoho parity).
 *
 *  - PortalShare: record-level visibility grants (admin grant/revoke; portal
 *    users read `GET /portal/me/records`). Visibility rule enforced everywhere:
 *    a portal user sees a record only when a PortalShare row targets EITHER
 *    their portalUserId OR their accountId — plus the cases they opened.
 *  - PortalCase: an external user submits/tracks/comments on their own cases.
 *    Submission best-effort materializes a ticket in ticket-service AND emits a
 *    domain event other services consume.
 *  - PortalDealRegistration: a `partner` portal user registers a deal referral
 *    (creates a portal-side record + emits a leads-topic event).
 */

export type PortalRecordType = 'case' | 'quote' | 'invoice' | 'document';

function ticketBase(): string {
  return process.env.TICKET_SERVICE_URL ?? 'http://localhost:3029';
}
function serviceHeaders(tenantId: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-service-token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
    'x-tenant-id': tenantId,
  };
}

/**
 * Best-effort proxy that asks ticket-service to materialize a portal-submitted
 * case as a real ticket in the internal lifecycle. Documented hook: it POSTs to
 * the ticket-service internal account-scoped endpoint; if that internal create
 * endpoint is not (yet) exposed the call fails-open (returns null) and the
 * PortalCase remains the portal-side source of truth while the emitted
 * `portal.case.submitted` event drives any async materialization. Never throws.
 */
async function materializeTicket(
  tenantId: string,
  accountId: string,
  input: { subject: string; description: string; priority: string; requesterContactId?: string | null; requesterEmail?: string | null }
): Promise<string | null> {
  try {
    const res = await fetch(`${ticketBase()}/api/v1/internal/accounts/${accountId}/tickets`, {
      method: 'POST',
      headers: serviceHeaders(tenantId),
      body: JSON.stringify({
        subject: input.subject,
        description: input.description,
        priority: input.priority,
        channel: 'PORTAL',
        source: 'PORTAL',
        requesterContactId: input.requesterContactId ?? null,
        requesterEmail: input.requesterEmail ?? null,
      }),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[portal-service] ticket materialize → HTTP ${res.status} (case kept portal-side)`);
      return null;
    }
    const body = (await res.json().catch(() => null)) as { data?: { id?: string } } | null;
    return body?.data?.id ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[portal-service] ticket materialize errored (case kept portal-side):', (err as Error)?.message);
    return null;
  }
}

export function createPortalSelfServiceService(prisma: PortalPrisma, producer?: NexusProducer | null) {
  const shares = (prisma as unknown as { portalShare: any }).portalShare;
  const cases = (prisma as unknown as { portalCase: any }).portalCase;
  const caseComments = (prisma as unknown as { portalCaseComment: any }).portalCaseComment;
  const deals = (prisma as unknown as { portalDealRegistration: any }).portalDealRegistration;
  const users = (prisma as unknown as { portalUser: any }).portalUser;

  const service = {
    // ── Admin: sharing grants (JWT + SETTINGS perm) ─────────────────────────
    async grantShare(
      tenantId: string,
      createdBy: string,
      input: { portalUserId?: string | null; accountId?: string | null; recordType: PortalRecordType; recordId: string; permission: 'VIEW' | 'COMMENT' }
    ) {
      return shares.create({
        data: {
          tenantId,
          portalUserId: input.portalUserId ?? null,
          accountId: input.accountId ?? null,
          recordType: input.recordType,
          recordId: input.recordId,
          permission: input.permission,
          createdBy,
        },
      });
    },

    async revokeShare(tenantId: string, id: string) {
      return shares.deleteMany({ where: { tenantId, id } });
    },

    async listShares(tenantId: string, filter: { portalUserId?: string; accountId?: string; recordType?: string } = {}) {
      return shares.findMany({
        where: {
          tenantId,
          ...(filter.portalUserId ? { portalUserId: filter.portalUserId } : {}),
          ...(filter.accountId ? { accountId: filter.accountId } : {}),
          ...(filter.recordType ? { recordType: filter.recordType } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
    },

    // ── Visibility core ─────────────────────────────────────────────────────
    /**
     * All shares visible to a session: grants targeting the user directly OR
     * their whole account. This is the single source of truth for portal
     * visibility enforcement.
     */
    async sharesForSession(session: PortalSession) {
      return shares.findMany({
        where: {
          tenantId: session.tid,
          OR: [{ portalUserId: session.sub }, { accountId: session.acc }],
        },
        orderBy: { createdAt: 'desc' },
      });
    },

    /** Set of recordIds of a given type this session may see via explicit share. */
    async visibleRecordIds(session: PortalSession, recordType: PortalRecordType): Promise<Set<string>> {
      const rows = await service.sharesForSession(session);
      return new Set(
        rows.filter((r: { recordType: string; recordId: string }) => r.recordType === recordType).map((r: { recordId: string }) => r.recordId)
      );
    },

    /**
     * The aggregate a portal user may see: every explicitly-shared record plus
     * the cases they themselves opened. Backs `GET /portal/me/records`.
     */
    async myRecords(session: PortalSession) {
      const [sharedRows, ownCases] = await Promise.all([
        service.sharesForSession(session),
        cases.findMany({
          where: { tenantId: session.tid, portalUserId: session.sub },
          orderBy: { createdAt: 'desc' },
          select: { id: true, subject: true, status: true, priority: true, createdAt: true },
        }),
      ]);
      const shared = sharedRows.map((r: { recordType: string; recordId: string; permission: string }) => ({
        recordType: r.recordType,
        recordId: r.recordId,
        permission: r.permission,
      }));
      return {
        shared,
        ownCases: ownCases.map((c: { id: string }) => ({ recordType: 'case', recordId: c.id, permission: 'COMMENT', ...c })),
      };
    },

    // ── Self-service cases (portal session) ─────────────────────────────────
    async submitCase(
      session: PortalSession,
      input: { subject: string; description: string; priority?: string; contactId?: string | null; requesterEmail?: string | null }
    ) {
      const priority = (input.priority ?? 'MEDIUM').toUpperCase();
      const externalTicketId = await materializeTicket(session.tid, session.acc, {
        subject: input.subject,
        description: input.description,
        priority,
        requesterContactId: input.contactId ?? null,
        requesterEmail: input.requesterEmail ?? null,
      });
      const created = await cases.create({
        data: {
          tenantId: session.tid,
          portalUserId: session.sub,
          accountId: session.acc,
          contactId: input.contactId ?? null,
          subject: input.subject,
          description: input.description,
          priority,
          externalTicketId,
        },
      });
      await emitPortalCaseSubmitted(producer, {
        tenantId: session.tid,
        caseId: created.id,
        accountId: session.acc,
        contactId: input.contactId ?? null,
        portalUserId: session.sub,
        subject: input.subject,
        priority,
        externalTicketId,
      });
      return created;
    },

    async listMyCases(session: PortalSession) {
      return cases.findMany({
        where: { tenantId: session.tid, portalUserId: session.sub },
        orderBy: { createdAt: 'desc' },
      });
    },

    /** One own-case with its comments, or null when not owned by this session. */
    async getMyCase(session: PortalSession, caseId: string) {
      return cases.findFirst({
        where: { id: caseId, tenantId: session.tid, portalUserId: session.sub },
        include: { comments: { orderBy: { createdAt: 'asc' } } },
      });
    },

    /**
     * Add a reply to the session's own case. Returns null when the case is not
     * owned by this session (enforces per-user case ownership).
     */
    async addCaseComment(session: PortalSession, caseId: string, body: string, authorName?: string | null) {
      const owned = await cases.findFirst({
        where: { id: caseId, tenantId: session.tid, portalUserId: session.sub },
        select: { id: true },
      });
      if (!owned) return null;
      const comment = await caseComments.create({
        data: { tenantId: session.tid, caseId, portalUserId: session.sub, body, authorName: authorName ?? null },
      });
      await cases.update({ where: { id: caseId }, data: { updatedAt: new Date() } });
      await emitPortalCaseComment(producer, {
        tenantId: session.tid,
        caseId,
        portalUserId: session.sub,
        commentId: comment.id,
      });
      return comment;
    },

    // ── Partner deal registration (portal session, partner-gated) ───────────
    /**
     * Register a deal referral. Gated to `partner` portalRole (verified against
     * the persisted PortalUser, never the token). Creates a portal-side record
     * and emits a leads-topic event so the CRM can materialize the referral.
     */
    async registerDeal(
      session: PortalSession,
      input: { dealName: string; customerName: string; estimatedValue?: number | null; currency?: string | null; notes?: string | null }
    ): Promise<{ ok: true; data: unknown } | { ok: false; code: 'FORBIDDEN'; message: string }> {
      const user = await users.findFirst({
        where: { id: session.sub, tenantId: session.tid },
        select: { portalRole: true },
      });
      if (!user || user.portalRole !== 'partner') {
        return { ok: false, code: 'FORBIDDEN', message: 'Deal registration is restricted to partner portal users' };
      }
      const created = await deals.create({
        data: {
          tenantId: session.tid,
          portalUserId: session.sub,
          accountId: session.acc,
          dealName: input.dealName,
          customerName: input.customerName,
          estimatedValue: input.estimatedValue ?? null,
          currency: input.currency ?? null,
          notes: input.notes ?? null,
        },
      });
      await emitPartnerDealRegistered(producer, {
        tenantId: session.tid,
        registrationId: created.id,
        accountId: session.acc,
        portalUserId: session.sub,
        dealName: input.dealName,
        customerName: input.customerName,
        estimatedValue: input.estimatedValue ?? null,
        currency: input.currency ?? null,
      });
      return { ok: true, data: created };
    },

    async listMyDeals(session: PortalSession) {
      return deals.findMany({
        where: { tenantId: session.tid, portalUserId: session.sub },
        orderBy: { createdAt: 'desc' },
      });
    },
  };

  return service;
}
