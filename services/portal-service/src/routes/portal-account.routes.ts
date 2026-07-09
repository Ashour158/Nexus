import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { verifyPortalSession, type PortalSession } from '../lib/portal-auth.js';
import type { createPortalAccountService } from '../services/portal-account.service.js';

/**
 * B9 logged-in portal-user surface. Two route groups:
 *
 *  - Public (`/portal/...`, JWT-bypassed via publicPrefixes): login + the
 *    account-scoped read/accept surfaces, guarded by a portal SESSION bearer
 *    token (verified here, distinct from the end-user JWT).
 *  - Admin (`/api/v1/portal/users`, end-user JWT + SETTINGS perm): provision /
 *    list / deactivate portal users.
 */
function readPortalSession(request: FastifyRequest): PortalSession | null {
  const auth = request.headers['authorization'];
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
  return verifyPortalSession(auth.slice('Bearer '.length).trim());
}

function requirePortalSession(request: FastifyRequest, reply: FastifyReply): PortalSession | null {
  const session = readPortalSession(request);
  if (!session) {
    reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired portal session', requestId: request.id } });
    return null;
  }
  return session;
}

export async function registerPortalAccountRoutes(
  app: FastifyInstance,
  account: ReturnType<typeof createPortalAccountService>
): Promise<void> {
  // ── Public: portal-user auth ──────────────────────────────────────────────
  app.post('/portal/auth/login', async (request, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(request.body);
    const result = await account.login(body.email, body.password);
    if (!result) {
      return reply.code(401).send({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password', requestId: request.id } });
    }
    return reply.send({ success: true, data: result });
  });

  app.get('/portal/me', async (request, reply) => {
    const session = requirePortalSession(request, reply);
    if (!session) return;
    const me = await account.me(session);
    if (!me) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Portal user not found', requestId: request.id } });
    return reply.send({ success: true, data: me });
  });

  // ── Public (session-guarded): account-scoped read surfaces ────────────────
  app.get('/portal/quotes', async (request, reply) => {
    const session = requirePortalSession(request, reply);
    if (!session) return;
    return reply.send({ success: true, data: await account.listQuotes(session) });
  });

  app.get('/portal/orders', async (request, reply) => {
    const session = requirePortalSession(request, reply);
    if (!session) return;
    return reply.send({ success: true, data: await account.listOrders(session) });
  });

  app.get('/portal/invoices', async (request, reply) => {
    const session = requirePortalSession(request, reply);
    if (!session) return;
    return reply.send({ success: true, data: await account.listInvoices(session) });
  });

  app.get('/portal/tickets', async (request, reply) => {
    const session = requirePortalSession(request, reply);
    if (!session) return;
    return reply.send({ success: true, data: await account.listTickets(session) });
  });

  app.post('/portal/quotes/:id/accept', async (request, reply) => {
    const session = requirePortalSession(request, reply);
    if (!session) return;
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const result = await account.acceptQuote(session, id);
    if (!result.ok) {
      const status = result.code === 'FORBIDDEN' ? 403 : 502;
      return reply.code(status).send({ success: false, error: { code: result.code, message: result.message, requestId: request.id } });
    }
    return reply.send({ success: true, data: result.data });
  });

  // ── Admin: provision portal users (end-user JWT + SETTINGS perm) ──────────
  app.post('/api/v1/portal/users', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const body = z
      .object({
        accountId: z.string().min(1),
        email: z.string().email(),
        name: z.string().nullable().optional(),
        password: z.string().min(8),
      })
      .parse(request.body);
    return reply.code(201).send({ success: true, data: await account.createUser(tenantId, body) });
  });

  app.get('/api/v1/portal/users', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const query = z.object({ accountId: z.string().optional() }).parse(request.query);
    return reply.send({ success: true, data: await account.listUsers(tenantId, query.accountId) });
  });

  app.delete('/api/v1/portal/users/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    return reply.send({ success: true, data: await account.deactivateUser(tenantId, id) });
  });
}
