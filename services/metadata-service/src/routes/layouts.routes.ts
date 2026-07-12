import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { z } from 'zod';
import { IdParamSchema } from '@nexus/validation';
import type { MetadataPrisma } from '../prisma.js';
import { createPageLayoutsService } from '../services/page-layouts.service.js';
import { LAYOUT_ACTION_TYPES, LAYOUT_RULE_OPERATORS } from '../services/layout-rules.js';

// ── Body / query schemas ────────────────────────────────────────────────────
const SectionSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().optional(),
    columns: z.number().int().min(1).max(4).optional(),
    fields: z.array(z.string()).optional(),
  })
  .passthrough();

const CreateLayoutBody = z.object({
  module: z.string().min(1).max(60),
  name: z.string().min(1).max(120),
  isDefault: z.boolean().optional(),
  assignedProfiles: z.array(z.string().min(1)).max(200).optional(),
  sections: z.array(SectionSchema).default([]),
  isActive: z.boolean().optional(),
});
const UpdateLayoutBody = CreateLayoutBody.partial().omit({ module: true });

const ActionSchema = z.object({
  type: z.enum(LAYOUT_ACTION_TYPES),
  target: z.string().min(1).max(120),
});
const CreateRuleBody = z.object({
  name: z.string().min(1).max(120),
  triggerField: z.string().min(1).max(120),
  operator: z.enum(LAYOUT_RULE_OPERATORS),
  triggerValue: z.unknown().optional(),
  actions: z.array(ActionSchema).default([]),
  position: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
const UpdateRuleBody = CreateRuleBody.partial();

const EvaluateBody = z.object({ record: z.record(z.unknown()).default({}) });

const LayoutParam = z.object({ layoutId: z.string().min(1) });
const LayoutChildParam = z.object({ layoutId: z.string().min(1), id: z.string().min(1) });

export async function registerLayoutsRoutes(app: FastifyInstance, prisma: MetadataPrisma): Promise<void> {
  const service = createPageLayoutsService(prisma);

  await app.register(
    async (r) => {
      const READ = { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) };
      const WRITE = { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) };

      // ── Static sub-routes first (so they aren't captured as :id) ──────────────
      r.get('/layouts/meta', READ, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.getMeta(jwt.tenantId) });
      });

      // Resolve the layout for the caller's role for a given module.
      r.get('/layouts/resolve', READ, async (request, reply) => {
        const q = request.query as Record<string, string | undefined>;
        if (!q.module) throw new ValidationError('module query param is required', {});
        const jwt = request.user as JwtPayload;
        const layout = await service.resolveLayout(jwt.tenantId, q.module, jwt.roles ?? []);
        return reply.send({ success: true, data: layout });
      });

      // ── Layout CRUD ───────────────────────────────────────────────────────────
      r.get('/layouts', READ, async (request, reply) => {
        const q = request.query as Record<string, string | undefined>;
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.listLayouts(jwt.tenantId, q.module) });
      });
      r.post('/layouts', WRITE, async (request, reply) => {
        const parsed = CreateLayoutBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.code(201).send({ success: true, data: await service.createLayout(jwt.tenantId, parsed.data) });
      });
      r.get('/layouts/:id', READ, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.getLayout(jwt.tenantId, id) });
      });
      r.patch('/layouts/:id', WRITE, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const parsed = UpdateLayoutBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.updateLayout(jwt.tenantId, id, parsed.data) });
      });
      r.delete('/layouts/:id', WRITE, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const jwt = request.user as JwtPayload;
        await service.deleteLayout(jwt.tenantId, id);
        return reply.send({ success: true, data: { id, deleted: true } });
      });

      // ── Evaluate (apply rules to a record → UI directives) ────────────────────
      r.post('/layouts/:layoutId/evaluate', READ, async (request, reply) => {
        const { layoutId } = LayoutParam.parse(request.params);
        const parsed = EvaluateBody.safeParse(request.body ?? {});
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.evaluate(jwt.tenantId, layoutId, parsed.data.record) });
      });

      // ── Layout Rules CRUD ─────────────────────────────────────────────────────
      r.get('/layouts/:layoutId/rules', READ, async (request, reply) => {
        const { layoutId } = LayoutParam.parse(request.params);
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.listRules(jwt.tenantId, layoutId) });
      });
      r.post('/layouts/:layoutId/rules', WRITE, async (request, reply) => {
        const { layoutId } = LayoutParam.parse(request.params);
        const parsed = CreateRuleBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.code(201).send({ success: true, data: await service.createRule(jwt.tenantId, layoutId, parsed.data) });
      });
      r.get('/layouts/:layoutId/rules/:id', READ, async (request, reply) => {
        const { layoutId, id } = LayoutChildParam.parse(request.params);
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.getRule(jwt.tenantId, layoutId, id) });
      });
      r.patch('/layouts/:layoutId/rules/:id', WRITE, async (request, reply) => {
        const { layoutId, id } = LayoutChildParam.parse(request.params);
        const parsed = UpdateRuleBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.updateRule(jwt.tenantId, layoutId, id, parsed.data) });
      });
      r.delete('/layouts/:layoutId/rules/:id', WRITE, async (request, reply) => {
        const { layoutId, id } = LayoutChildParam.parse(request.params);
        const jwt = request.user as JwtPayload;
        await service.deleteRule(jwt.tenantId, layoutId, id);
        return reply.send({ success: true, data: { id, deleted: true } });
      });
    },
    { prefix: '/api/v1' }
  );
}
