import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createPortalService } from '../services/portal.service.js';

export async function registerPortalRoutes(
  app: FastifyInstance,
  portal: ReturnType<typeof createPortalService>
): Promise<void> {
  app.get('/portal/:token', async (request, reply) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(request.params);
    const data = await portal.getPortalContext(token);
    if (!data) return reply.code(404).send({ success: false, error: 'Portal link expired or invalid' });
    return reply.send({ success: true, data });
  });

  app.post('/portal/:token/accept', async (request, reply) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(request.params);
    const data = await portal.accept(token);
    if (!data) return reply.code(404).send({ success: false, error: 'Portal link expired or invalid' });
    return reply.send({ success: true, data });
  });

  app.post('/portal/:token/reject', async (request, reply) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(request.params);
    const body = z.object({ reason: z.string().optional() }).parse(request.body ?? {});
    const data = await portal.reject(token, body.reason);
    if (!data) return reply.code(404).send({ success: false, error: 'Portal link expired or invalid' });
    return reply.send({ success: true, data });
  });

  app.get('/portal/:token/download', async (request, reply) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(request.params);
    const ctx = await portal.getPortalContext(token);
    if (!ctx) return reply.code(404).send({ success: false, error: 'Portal link expired or invalid' });
    await portal.recordAction(token, 'downloaded');
    const documentUrl = process.env.DOCUMENT_SERVICE_URL ?? 'http://localhost:3016';
    const res = await fetch(`${documentUrl}/api/v1/documents/quotes/${ctx.entityId}/pdf`, {
      headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}` },
    });
    if (!res.ok) return reply.code(502).send({ success: false, error: 'Could not generate PDF' });
    return reply.header('content-type', 'application/pdf').send(Buffer.from(await res.arrayBuffer()));
  });

  app.post('/api/v1/portal/tokens', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    const body = z
      .object({
        entityType: z.enum(['QUOTE', 'CONTRACT', 'INVOICE', 'ACCOUNT']),
        entityId: z.string().min(1),
        expiresInDays: z.number().int().positive().default(30),
      })
      .parse(request.body);
    return reply.code(201).send({
      success: true,
      data: await portal.createToken(user.tenantId, body.entityType, body.entityId, user.sub, body.expiresInDays),
    });
  });

  app.get('/api/v1/portal/tokens', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const query = z.object({ entityId: z.string().optional() }).parse(request.query);
    return reply.send({ success: true, data: await portal.listTokens(tenantId, query.entityId) });
  });

  app.delete('/api/v1/portal/tokens/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    return reply.send({ success: true, data: await portal.deleteToken(tenantId, id) });
  });

  app.get('/api/v1/portal/branding', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    return reply.send({ success: true, data: await portal.getBranding(tenantId) });
  });

  app.patch('/api/v1/portal/branding', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
    const tenantId = (request as unknown as { user: { tenantId: string } }).user.tenantId;
    const body = z.object({ logoUrl: z.string().nullable().optional(), primaryColor: z.string().optional(), companyName: z.string().nullable().optional() }).parse(request.body);
    return reply.send({ success: true, data: await portal.updateBranding(tenantId, body) });
  });
}
