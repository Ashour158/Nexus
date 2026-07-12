import { randomBytes } from 'node:crypto';
import type { PortalPrisma } from '../prisma.js';
import { hashPassword, signPortalSession, verifyPassword, type PortalSession } from '../lib/portal-auth.js';

/** Columns safe to return for a portal user (never the passwordHash). */
const PORTAL_USER_SAFE_SELECT = {
  id: true,
  tenantId: true,
  accountId: true,
  contactId: true,
  email: true,
  name: true,
  portalRole: true,
  status: true,
  isActive: true,
  inviteExpiresAt: true,
  invitedBy: true,
  acceptedAt: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

const INVITE_TTL_DAYS = 14;

/**
 * Logged-in portal-user surface (B9). A PortalUser authenticates with
 * email+password, receives a signed portal session, and can then read ONLY
 * their own account's quotes / orders / invoices / tickets and accept a quote.
 *
 * Cross-service reads are proxied to finance-service / ticket-service via their
 * INTERNAL (`/api/v1/internal/...`) endpoints using `x-service-token` +
 * `x-tenant-id`. Every read is scoped by BOTH tenantId and accountId (taken from
 * the verified session, never from the client) so a portal user can never see
 * another account's data. Reads are fail-open (empty list on any non-2xx) so a
 * downstream outage degrades gracefully rather than 500-ing the portal.
 */
function financeBase(): string {
  return process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3002';
}
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

async function proxyList(url: string, tenantId: string): Promise<unknown[]> {
  try {
    const res = await fetch(url, { headers: serviceHeaders(tenantId) });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[portal-service] proxy read ${url} → HTTP ${res.status}`);
      return [];
    }
    const body = (await res.json().catch(() => null)) as { data?: unknown } | null;
    const data = body?.data;
    if (Array.isArray(data)) return data;
    // finance list endpoints may wrap as { data: { data: [], total } }
    if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
      return (data as { data: unknown[] }).data;
    }
    return [];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[portal-service] proxy read ${url} errored:`, (err as Error)?.message);
    return [];
  }
}

export function createPortalAccountService(prisma: PortalPrisma) {
  const users = (prisma as unknown as { portalUser: any }).portalUser;
  const shares = (prisma as unknown as { portalShare: any }).portalShare;

  /**
   * Portal visibility enforcement. When one or more PortalShare grants exist for
   * this session's identity/account for `recordType`, the portal user's view is
   * NARROWED to exactly those shared recordIds. When no such grants exist, the
   * account-scoped default applies (the whole account's records) — so explicit
   * sharing tightens, never silently empties, an existing customer's view.
   */
  async function narrowBySharesIfAny(
    session: PortalSession,
    recordType: 'quote' | 'invoice' | 'document',
    rows: unknown[]
  ): Promise<unknown[]> {
    const grants: Array<{ recordId: string }> = await shares.findMany({
      where: {
        tenantId: session.tid,
        recordType,
        OR: [{ portalUserId: session.sub }, { accountId: session.acc }],
      },
      select: { recordId: true },
    });
    if (grants.length === 0) return rows;
    const allowed = new Set(grants.map((g) => g.recordId));
    return rows.filter((r) => {
      const id = (r as { id?: string }).id;
      return typeof id === 'string' && allowed.has(id);
    });
  }

  const service = {
    // ── Admin provisioning (called from JWT-protected /api/v1/portal/users) ──
    async createUser(
      tenantId: string,
      input: { accountId: string; email: string; name?: string | null; password: string; portalRole?: string; contactId?: string | null }
    ) {
      const user = await users.create({
        data: {
          tenantId,
          accountId: input.accountId,
          contactId: input.contactId ?? null,
          email: input.email.toLowerCase().trim(),
          name: input.name ?? null,
          portalRole: input.portalRole ?? 'customer',
          status: 'ACTIVE',
          passwordHash: hashPassword(input.password),
        },
        select: PORTAL_USER_SAFE_SELECT,
      });
      return user;
    },

    /**
     * Invite an external portal user. Creates the PortalUser as status=INVITED
     * with a single-use invite token and NO password (passwordHash stays null,
     * so login is impossible until accepted + a credential is set out-of-band).
     * Returns the safe row plus the raw inviteToken so the caller can hand it to
     * the invited party (email delivery is out of scope — documented hook).
     */
    async inviteUser(
      tenantId: string,
      invitedBy: string,
      input: { accountId: string; email: string; name?: string | null; portalRole?: string; contactId?: string | null }
    ) {
      const inviteToken = randomBytes(24).toString('hex');
      const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
      const user = await users.create({
        data: {
          tenantId,
          accountId: input.accountId,
          contactId: input.contactId ?? null,
          email: input.email.toLowerCase().trim(),
          name: input.name ?? null,
          portalRole: input.portalRole ?? 'customer',
          status: 'INVITED',
          isActive: true,
          passwordHash: null,
          inviteToken,
          inviteExpiresAt,
          invitedBy,
        },
        select: PORTAL_USER_SAFE_SELECT,
      });
      // Return the raw token exactly once. NOTE (documented hook): wiring this to
      // an email/credential-setup flow is intentionally out of scope here.
      return { ...user, inviteToken };
    },

    /**
     * Accept an invitation by its token. Marks the user ACTIVE and clears the
     * token. Does NOT set a password — the actual credential flow is a
     * documented hook (see PortalUser in schema); until a credential is set the
     * accepted user still cannot log in.
     */
    async acceptInvite(inviteToken: string) {
      const user = await users.findFirst({ where: { inviteToken } });
      if (!user) return { ok: false as const, code: 'NOT_FOUND' as const, message: 'Invite not found' };
      if (user.status === 'DISABLED') return { ok: false as const, code: 'DISABLED' as const, message: 'Invite is no longer valid' };
      if (user.inviteExpiresAt && user.inviteExpiresAt < new Date()) {
        return { ok: false as const, code: 'EXPIRED' as const, message: 'Invite has expired' };
      }
      const updated = await users.update({
        where: { id: user.id },
        data: { status: 'ACTIVE', acceptedAt: new Date(), inviteToken: null, inviteExpiresAt: null },
        select: PORTAL_USER_SAFE_SELECT,
      });
      return { ok: true as const, data: updated };
    },

    async listUsers(tenantId: string, accountId?: string) {
      const rows = await users.findMany({
        where: { tenantId, ...(accountId ? { accountId } : {}) },
        orderBy: { createdAt: 'desc' },
        select: PORTAL_USER_SAFE_SELECT,
      });
      return rows;
    },

    /** Disable a portal user: status=DISABLED and isActive=false (blocks login). */
    async disableUser(tenantId: string, id: string) {
      return users.updateMany({ where: { tenantId, id }, data: { status: 'DISABLED', isActive: false } });
    },

    // ── Portal-user auth ────────────────────────────────────────────────────
    async login(email: string, password: string) {
      const user = await users.findFirst({
        where: { email: email.toLowerCase().trim(), isActive: true, status: 'ACTIVE' },
      });
      // No passwordHash → invited-but-not-credentialed user (documented hook): cannot log in.
      if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) return null;
      await users.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      const { token, expiresAt } = signPortalSession({ sub: user.id, tid: user.tenantId, acc: user.accountId });
      return {
        token,
        expiresAt,
        user: { id: user.id, email: user.email, name: user.name, accountId: user.accountId },
      };
    },

    async me(session: PortalSession) {
      const user = await users.findFirst({
        where: { id: session.sub, tenantId: session.tid },
        select: { id: true, email: true, name: true, accountId: true, contactId: true, portalRole: true, status: true, tenantId: true },
      });
      return user;
    },

    // ── Account-scoped read surfaces (proxied, fail-open) ────────────────────
    async listQuotes(session: PortalSession) {
      const rows = await proxyList(`${financeBase()}/api/v1/internal/accounts/${session.acc}/quotes`, session.tid);
      return narrowBySharesIfAny(session, 'quote', rows);
    },
    async listOrders(session: PortalSession) {
      return proxyList(`${financeBase()}/api/v1/internal/accounts/${session.acc}/orders`, session.tid);
    },
    async listInvoices(session: PortalSession) {
      const rows = await proxyList(`${financeBase()}/api/v1/internal/accounts/${session.acc}/invoices`, session.tid);
      return narrowBySharesIfAny(session, 'invoice', rows);
    },
    async listTickets(session: PortalSession) {
      return proxyList(`${ticketBase()}/api/v1/internal/accounts/${session.acc}/tickets`, session.tid);
    },

    /**
     * Accept a quote on behalf of the portal user. Verifies the quote belongs to
     * the session's account (via the finance internal read) BEFORE forwarding the
     * accept — a portal user can only accept their own account's quotes. Delegates
     * the actual status flip + convert-to-order to finance's internal accept
     * endpoint. Returns a discriminated result the route maps to 200/403/502.
     */
    async acceptQuote(
      session: PortalSession,
      quoteId: string
    ): Promise<{ ok: true; data: unknown } | { ok: false; code: 'FORBIDDEN' | 'UPSTREAM'; message: string }> {
      // 1) ownership check
      let quote: { accountId?: string } | null = null;
      try {
        const res = await fetch(`${financeBase()}/api/v1/internal/quotes/${quoteId}`, {
          headers: serviceHeaders(session.tid),
        });
        if (res.ok) {
          const body = (await res.json().catch(() => null)) as { data?: { accountId?: string } } | null;
          quote = body?.data ?? null;
        }
      } catch {
        quote = null;
      }
      if (!quote || quote.accountId !== session.acc) {
        return { ok: false, code: 'FORBIDDEN', message: 'Quote not found for this account' };
      }
      // 2) forward accept (finance performs e-sign accept + convert-to-order)
      try {
        const res = await fetch(`${financeBase()}/api/v1/internal/quotes/${quoteId}/accept`, {
          method: 'POST',
          headers: serviceHeaders(session.tid),
          body: JSON.stringify({ acceptedBy: `portal-user:${session.sub}` }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          return { ok: false, code: 'UPSTREAM', message: `finance accept failed: HTTP ${res.status} ${text}` };
        }
        const body = (await res.json().catch(() => null)) as { data?: unknown } | null;
        return { ok: true, data: body?.data ?? null };
      } catch (err) {
        return { ok: false, code: 'UPSTREAM', message: `finance accept errored: ${(err as Error)?.message}` };
      }
    },
  };

  return service;
}
