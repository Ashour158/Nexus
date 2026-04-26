import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createGoogleGmailService } from '../services/google-gmail.service.js';

const Query = z.object({
  contactId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const SendSchema = z.object({
  to: z.array(z.string().email()).min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  threadId: z.string().optional(),
});

export async function registerEmailRoutes(
  app: FastifyInstance,
  gmail: ReturnType<typeof createGoogleGmailService>
) {
  app.get(
    '/api/v1/integrations/email/threads',
    { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.READ) },
    async (request, reply) => {
      const q = Query.parse(request.query);
      const crmUrl = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
      const token = (request.headers.authorization ?? '').toString();
      const params = new URLSearchParams({
        page: String(q.page),
        limit: String(q.limit),
      });
      if (q.contactId) params.set('contactId', q.contactId);
      const res = await fetch(`${crmUrl}/api/v1/email-threads?${params.toString()}`, {
        headers: { Authorization: token },
      });
      const data = res.ok ? await res.json() : { success: true, data: [] };
      return reply.send(data);
    }
  );

  app.get(
    '/api/v1/integrations/email/threads/:id',
    { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.READ) },
    async (request, reply) => {
      const id = z.object({ id: z.string().cuid() }).parse(request.params).id;
      const crmUrl = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
      const token = (request.headers.authorization ?? '').toString();
      const res = await fetch(`${crmUrl}/api/v1/email-threads/${id}`, {
        headers: { Authorization: token },
      });
      if (!res.ok) return reply.code(404).send({ success: false, error: 'Not found' });
      return reply.send(await res.json());
    }
  );

  app.post(
    '/api/v1/integrations/email/send',
    { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.MANAGE) },
    async (request, reply) => {
      const body = SendSchema.parse(request.body);
      const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
      const data = await gmail.sendEmail(
        user.tenantId,
        user.sub,
        body.to,
        body.subject,
        body.body
      );
      return reply.send({ success: true, data });
    }
  );
}
