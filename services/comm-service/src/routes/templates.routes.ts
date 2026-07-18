import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { z } from 'zod';
import type { createTemplatesService } from '../services/templates.service.js';
import { TEMPLATE_TYPES } from '../services/templates.service.js';
import type { TemplateType } from '../services/templates.service.js';
import { getMergeFields, getSampleData, isTemplateModule, TEMPLATE_MODULES } from '../services/merge-fields.js';
import type { TemplateModule } from '../services/merge-fields.js';

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

const TypeEnum = z.enum(TEMPLATE_TYPES as unknown as [TemplateType, ...TemplateType[]]);
const ModuleEnum = z.enum(TEMPLATE_MODULES as unknown as [TemplateModule, ...TemplateModule[]]);

// ── Unified Template Designer schemas (EMAIL | SMS | DOCUMENT) ──────────────
const CreateTemplateSchema = z.object({
  name: z.string().min(1),
  type: TypeEnum.optional(),
  module: ModuleEnum.optional(),
  subject: z.string().optional(),
  body: z.string().min(1),
  textBody: z.string().optional(),
  category: z.string().optional(),
  isActive: z.boolean().optional(),
});

const PatchTemplateSchema = CreateTemplateSchema.partial();

const TemplateListQuery = z.object({
  type: TypeEnum.optional(),
  module: ModuleEnum.optional(),
  category: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

const MergeFieldsQuery = z.object({ module: ModuleEnum });

const PreviewSchema = z.object({
  subject: z.string().optional(),
  body: z.string().min(1),
  module: ModuleEnum.optional(),
  sampleData: z.record(z.string(), z.string()).optional(),
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

      // ── Template Designer: merge-field catalog ───────────────────────────
      // Static catalog the designer's "insert field" menu reads. Tenant-safe
      // (no data access); still gated behind SETTINGS.READ like the rest.
      r.get(
        '/templates/merge-fields',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const q = MergeFieldsQuery.safeParse(request.query);
          if (!q.success) throw new ValidationError('Invalid query', q.error.flatten());
          const module = q.data.module;
          if (!isTemplateModule(module)) throw new ValidationError('Unknown module', { module });
          return reply.send({ success: true, data: getMergeFields(module) });
        }
      );

      // ── Template Designer: live preview / render ─────────────────────────
      // Renders caller-supplied (unsaved) content via the shared render engine.
      // Falls back to catalog placeholder values when `sampleData` is omitted.
      r.post(
        '/templates/preview',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const parsed = PreviewSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const { subject, body, module, sampleData } = parsed.data;
          const variables =
            sampleData ?? (module && isTemplateModule(module) ? getSampleData(module) : {});
          const rendered = templates.renderContent({ subject, body }, variables, {
            fillMissingWith: '',
          });
          return reply.send({ success: true, data: rendered });
        }
      );

      // ── Template Designer: unified CRUD (EMAIL | SMS | DOCUMENT) ──────────
      r.get(
        '/templates',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const q = TemplateListQuery.safeParse(request.query);
          if (!q.success) throw new ValidationError('Invalid query', q.error.flatten());
          const jwt = request.user as JwtPayload;
          const rows = await templates.listTemplates(jwt.tenantId, q.data);
          return reply.send({ success: true, data: rows });
        }
      );

      r.get(
        '/templates/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string() }).parse(request.params);
          const jwt = request.user as JwtPayload;
          const row = await templates.getTemplateById(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/templates',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreateTemplateSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await templates.createTemplate(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/templates/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string() }).parse(request.params);
          const parsed = PatchTemplateSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await templates.updateTemplate(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/templates/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string() }).parse(request.params);
          const jwt = request.user as JwtPayload;
          await templates.deleteTemplate(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
