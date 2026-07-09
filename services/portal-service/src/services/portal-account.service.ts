import type { PortalPrisma } from '../prisma.js';
import { hashPassword, signPortalSession, verifyPassword, type PortalSession } from '../lib/portal-auth.js';

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
  return process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3003';
}
function ticketBase(): string {
  return process.env.TICKET_SERVICE_URL ?? 'http://localhost:3020';
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

  const service = {
    // ── Admin provisioning (called from JWT-protected /api/v1/portal/users) ──
    async createUser(
      tenantId: string,
      input: { accountId: string; email: string; name?: string | null; password: string }
    ) {
      const user = await users.create({
        data: {
          tenantId,
          accountId: input.accountId,
          email: input.email.toLowerCase().trim(),
          name: input.name ?? null,
          passwordHash: hashPassword(input.password),
        },
      });
      const { passwordHash: _omit, ...safe } = user;
      return safe;
    },

    async listUsers(tenantId: string, accountId?: string) {
      const rows = await users.findMany({
        where: { tenantId, accountId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, tenantId: true, accountId: true, email: true, name: true, isActive: true, lastLoginAt: true, createdAt: true },
      });
      return rows;
    },

    async deactivateUser(tenantId: string, id: string) {
      return users.updateMany({ where: { tenantId, id }, data: { isActive: false } });
    },

    // ── Portal-user auth ────────────────────────────────────────────────────
    async login(email: string, password: string) {
      const user = await users.findFirst({
        where: { email: email.toLowerCase().trim(), isActive: true },
      });
      if (!user || !verifyPassword(password, user.passwordHash)) return null;
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
        select: { id: true, email: true, name: true, accountId: true, tenantId: true },
      });
      return user;
    },

    // ── Account-scoped read surfaces (proxied, fail-open) ────────────────────
    async listQuotes(session: PortalSession) {
      return proxyList(`${financeBase()}/api/v1/internal/accounts/${session.acc}/quotes`, session.tid);
    },
    async listOrders(session: PortalSession) {
      return proxyList(`${financeBase()}/api/v1/internal/accounts/${session.acc}/orders`, session.tid);
    },
    async listInvoices(session: PortalSession) {
      return proxyList(`${financeBase()}/api/v1/internal/accounts/${session.acc}/invoices`, session.tid);
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
