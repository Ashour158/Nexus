import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { requirePortalSession } from '../lib/portal-session-guard.js';
import type { createPortalSelfServiceService } from '../services/portal-selfservice.service.js';

/**
 * Portal self-service + sharing routes. Two clearly-separated groups:
 *
 *  - Portal-facing (`/portal/*`, PUBLIC prefix, portal-SESSION guarded): the
 *    external user's own records, case submit/track/comment, and partner deal
 *    registration.
 *  - Admin (`/api/v1/portal/shares`, end-user JWT + SETTINGS perm): grant / list
 *    / revoke record-level shares.
 */
export async function registerPortalSelfServiceRoutes(
  app: FastifyInstance,
  selfService: ReturnType<typeof createPortalSelfServiceService>
): Promise<void> {
  // ── Portal-facing: visibility ────────────────────────────────────────────
  app.get('/portal/me/records', async (request, reply) => {
    const session = requirePortalSession(request, reply);
    if (!session) return;
    return reply.send({ success: true, data: await selfService.myRecords(session) });
  });

  // ── Portal-facing: self-service cases ────────────────────────────────────
  app.post('/portal/cases', async (request, reply) => {
    const session = requirePortalSession(request, reply);
    if (!session) return;
    const body = z
      .object({
        subject: z.string().min(1).max(500),
        description: z.string().min(1),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
        contactId: z.string().nullable().optional(),
        requesterEmail: z.string().email().nullable().optional(),
      })
      .parse(request.body);
    return reply.code(201).send({ success: true, data: await selfService.submitCase(session, body) });
  });

  app.get('/portal/cases', async (request, reply) => {
    const session = requirePortalSession(request, reply);
    if (!session) return;
    return reply.send({ success: true, data: await selfService.listMyCases(session) });
  });

  app.get('/portal/cases/:id', async (request, reply) => {
    const session = requirePortalSession(request, reply);
    if (!session) return;
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const found = await selfService.getMyCase(session, id);
    if (!found) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Case not found', requestId: request.id } });
    return reply.send({ success: true, data: found });
  });

  app.post('/portal/cases/:id/comments', async (request, reply) => {
    const session = requirePortalSession(request, reply);
    if (!session) return;
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ body: z.string().min(1), authorName: z.string().nullable().optional() }).parse(request.body);
    const comment = await selfService.addCaseComment(session, id, body.body, body.authorName ?? null);
    if (!comment) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Case not found', requestId: request.id } });
    return reply.code(201).send({ success: true, data: comment });
  });

  // ── Portal-facing: partner deal registration ─────────────────────────────
  app.post('/portal/deals/register', async (request, reply) => {
    const session = requirePortalSession(request, reply);
    if (!session) return;
    const body = z
      .object({
        dealName: z.string().min(1).max(300),
        customerName: z.string().min(1).max(300),
        estimatedValue: z.number().nonnegative().nullable().optional(),
        currency: z.string().min(1).max(8).nullable().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(request.body);
    const result = await selfService.registerDeal(session, body);
    if (!result.ok) {
      return reply.code(403).send({ success: false, error: { code: result.code, message: result.message, requestId: request.id } });
    }
    return reply.code(201).send({ success: true, data: result.data });
  });

  app.get('/portal/deals', async (request, reply) => {
    const session = requirePortalSession(request, reply);
    if (!session) return;
    return reply.send({ success: true, data: await selfService.listMyDeals(session) });
  });

  // ── Admin: record-level shares (end-user JWT + SETTINGS perm) ─────────────
  app.post('/api/v1/portal/shares', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    const body = z
      .object({
        portalUserId: z.string().nullable().optional(),
        accountId: z.string().nullable().optional(),
        recordType: z.enum(['case', 'quote', 'invoice', 'document']),
        recordId: z.string().min(1),
        permission: z.enum(['VIEW', 'COMMENT']).default('VIEW'),
      })
      .refine((b) => Boolean(b.portalUserId) || Boolean(b.accountId), {
        message: 'Either portalUserId or accountId must be provided',
      })
      .parse(request.body);
    return reply.code(201).send({ success: true, data: await selfService.grantShare(user.tenantId, user.sub, body) });
  });

  app.get('/api/v1/portal/shares', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const query = z.object({ portalUserId: z.string().optional(), accountId: z.string().optional(), recordType: z.string().optional() }).parse(request.query);
    return reply.send({ success: true, data: await selfService.listShares(tenantId, query) });
  });

  app.delete('/api/v1/portal/shares/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    return reply.send({ success: true, data: await selfService.revokeShare(tenantId, id) });
  });
}
