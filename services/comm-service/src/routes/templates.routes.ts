import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { z } from 'zod';
import type { createTemplatesService } from '../services/templates.service.js';

const CreateEmailSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  htmlBody: z.string().min(1),
  textBody: z.string().min(1),
  category: z.string().optional(),
});

const PatchEmailSchema = CreateEmailSchema.partial();

const CreateSmsSchema = z.object({
  name: z.string().min(1),
  body: z.string().min(1).max(160),
});

const PatchSmsSchema = CreateSmsSchema.partial();

const ListQuery = z.object({
  category: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export async function registerTemplatesRoutes(
  app: FastifyInstance,
  templates: ReturnType<typeof createTemplatesService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/templates/email',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const q = ListQuery.safeParse(request.query);
          if (!q.success) throw new ValidationError('Invalid query', q.error.flatten());
          const jwt = request.user as JwtPayload;
          const rows = await templates.listEmailTemplates(jwt.tenantId, q.data);
          return reply.send({ success: true, data: rows });
        }
      );

      r.get(
        '/templates/email/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string() }).parse(request.params);
          const jwt = request.user as JwtPayload;
          const row = await templates.getEmailTemplateById(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/templates/email',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreateEmailSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await templates.createEmailTemplate(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/templates/email/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string() }).parse(request.params);
          const parsed = PatchEmailSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await templates.updateEmailTemplate(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/templates/email/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string() }).parse(request.params);
          const jwt = request.user as JwtPayload;
          await templates.deleteEmailTemplate(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      r.get(
        '/templates/sms',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const q = z.object({ isActive: z.coerce.boolean().optional() }).safeParse(request.query);
          if (!q.success) throw new ValidationError('Invalid query', q.error.flatten());
          const jwt = request.user as JwtPayload;
          const rows = await templates.listSmsTemplates(jwt.tenantId, q.data);
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/templates/sms',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreateSmsSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await templates.createSmsTemplate(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/templates/sms/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string() }).parse(request.params);
          const parsed = PatchSmsSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await templates.updateSmsTemplate(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/templates/sms/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string() }).parse(request.params);
          const jwt = request.user as JwtPayload;
          await templates.deleteSmsTemplate(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
