import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { z } from 'zod';
import { IdParamSchema } from '@nexus/validation';
import type { MetadataPrisma } from '../prisma.js';
import { createCustomModulesService } from '../services/custom-modules.service.js';
import { createCustomRecordsService } from '../services/custom-records.service.js';
import { evaluateFormula } from '../services/formula-engine.js';

// ── Body schemas ──────────────────────────────────────────────────────────────
const CreateModuleBody = z.object({
  apiName: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  pluralLabel: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  icon: z.string().max(120).optional(),
  isActive: z.boolean().optional(),
});
const UpdateModuleBody = z.object({
  label: z.string().min(1).max(120).optional(),
  pluralLabel: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  icon: z.string().max(120).optional(),
  isActive: z.boolean().optional(),
});
const CreateFieldBody = z.object({
  apiName: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  type: z.string().min(1).max(20),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  options: z.unknown().optional(),
  formula: z.string().max(4000).optional(),
  lookupModule: z.string().max(60).optional(),
  defaultValue: z.unknown().optional(),
  sortOrder: z.number().int().optional(),
});
const UpdateFieldBody = CreateFieldBody.partial();
const ReorderBody = z.object({
  order: z.array(z.object({ id: z.string().min(1), sortOrder: z.number().int() })).max(500),
});
const CreateLayoutBody = z.object({
  name: z.string().min(1).max(120),
  sections: z.array(z.object({ title: z.string().optional(), columns: z.number().int().optional(), fields: z.array(z.string()).optional() })).default([]),
  isDefault: z.boolean().optional(),
});
const UpdateLayoutBody = CreateLayoutBody.partial();
const RecordBody = z.object({ data: z.record(z.unknown()).default({}) });
const FormulaEvalBody = z.object({
  formula: z.string().min(1).max(4000),
  record: z.record(z.unknown()).default({}),
});

const ModuleParam = z.object({ moduleId: z.string().min(1) });
const ModuleChildParam = z.object({ moduleId: z.string().min(1), id: z.string().min(1) });

export async function registerCustomModulesRoutes(app: FastifyInstance, prisma: MetadataPrisma): Promise<void> {
  const modules = createCustomModulesService(prisma);
  const records = createCustomRecordsService(prisma);

  await app.register(
    async (r) => {
      const READ = { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) };
      const WRITE = { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) };
      const DATA_READ = { preHandler: requirePermission(PERMISSIONS.DATA.READ) };
      const DATA_WRITE = { preHandler: requirePermission(PERMISSIONS.DATA.UPDATE) };

      // ── Modules ─────────────────────────────────────────────────────────────
      r.get('/custom-modules', READ, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await modules.listModules(jwt.tenantId) });
      });
      r.post('/custom-modules', WRITE, async (request, reply) => {
        const parsed = CreateModuleBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.code(201).send({ success: true, data: await modules.createModule(jwt.tenantId, parsed.data) });
      });
      r.get('/custom-modules/:id', READ, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await modules.getModule(jwt.tenantId, id) });
      });
      r.patch('/custom-modules/:id', WRITE, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const parsed = UpdateModuleBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await modules.updateModule(jwt.tenantId, id, parsed.data) });
      });
      r.delete('/custom-modules/:id', WRITE, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const jwt = request.user as JwtPayload;
        await modules.deleteModule(jwt.tenantId, id);
        return reply.send({ success: true, data: { id, deleted: true } });
      });

      // ── Fields ──────────────────────────────────────────────────────────────
      r.get('/custom-modules/:moduleId/fields', READ, async (request, reply) => {
        const { moduleId } = ModuleParam.parse(request.params);
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await modules.listFields(jwt.tenantId, moduleId) });
      });
      r.post('/custom-modules/:moduleId/fields', WRITE, async (request, reply) => {
        const { moduleId } = ModuleParam.parse(request.params);
        const parsed = CreateFieldBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.code(201).send({ success: true, data: await modules.addField(jwt.tenantId, moduleId, parsed.data) });
      });
      // Reorder must precede the :id route so "reorder" isn't captured as an id.
      r.patch('/custom-modules/:moduleId/fields/reorder', WRITE, async (request, reply) => {
        const { moduleId } = ModuleParam.parse(request.params);
        const parsed = ReorderBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await modules.reorderFields(jwt.tenantId, moduleId, parsed.data.order) });
      });
      r.patch('/custom-modules/:moduleId/fields/:id', WRITE, async (request, reply) => {
        const { moduleId, id } = ModuleChildParam.parse(request.params);
        const parsed = UpdateFieldBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await modules.updateField(jwt.tenantId, moduleId, id, parsed.data) });
      });
      r.delete('/custom-modules/:moduleId/fields/:id', WRITE, async (request, reply) => {
        const { moduleId, id } = ModuleChildParam.parse(request.params);
        const jwt = request.user as JwtPayload;
        await modules.removeField(jwt.tenantId, moduleId, id);
        return reply.send({ success: true, data: { id, deleted: true } });
      });

      // ── Layouts ─────────────────────────────────────────────────────────────
      r.get('/custom-modules/:moduleId/layouts', READ, async (request, reply) => {
        const { moduleId } = ModuleParam.parse(request.params);
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await modules.listLayouts(jwt.tenantId, moduleId) });
      });
      r.post('/custom-modules/:moduleId/layouts', WRITE, async (request, reply) => {
        const { moduleId } = ModuleParam.parse(request.params);
        const parsed = CreateLayoutBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.code(201).send({ success: true, data: await modules.createLayout(jwt.tenantId, moduleId, parsed.data) });
      });
      r.get('/custom-modules/:moduleId/layouts/:id', READ, async (request, reply) => {
        const { moduleId, id } = ModuleChildParam.parse(request.params);
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await modules.getLayout(jwt.tenantId, moduleId, id) });
      });
      r.patch('/custom-modules/:moduleId/layouts/:id', WRITE, async (request, reply) => {
        const { moduleId, id } = ModuleChildParam.parse(request.params);
        const parsed = UpdateLayoutBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await modules.updateLayout(jwt.tenantId, moduleId, id, parsed.data) });
      });
      r.delete('/custom-modules/:moduleId/layouts/:id', WRITE, async (request, reply) => {
        const { moduleId, id } = ModuleChildParam.parse(request.params);
        const jwt = request.user as JwtPayload;
        await modules.deleteLayout(jwt.tenantId, moduleId, id);
        return reply.send({ success: true, data: { id, deleted: true } });
      });

      // ── Records ─────────────────────────────────────────────────────────────
      r.get('/custom-modules/:moduleId/records', DATA_READ, async (request, reply) => {
        const { moduleId } = ModuleParam.parse(request.params);
        const jwt = request.user as JwtPayload;
        const q = request.query as Record<string, string | undefined>;
        const page = q.page ? Number(q.page) : undefined;
        const pageSize = q.pageSize ? Number(q.pageSize) : undefined;
        let filter: Record<string, unknown> | undefined;
        if (q.filter) {
          try { filter = JSON.parse(q.filter); } catch { filter = undefined; }
        }
        const result = await records.listRecords(jwt.tenantId, moduleId, { page, pageSize, filter });
        return reply.send({ success: true, ...result });
      });
      r.post('/custom-modules/:moduleId/records', DATA_WRITE, async (request, reply) => {
        const { moduleId } = ModuleParam.parse(request.params);
        const parsed = RecordBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const rec = await records.createRecord(jwt.tenantId, moduleId, parsed.data.data, jwt.sub);
        return reply.code(201).send({ success: true, data: rec });
      });
      r.get('/custom-modules/:moduleId/records/:id', DATA_READ, async (request, reply) => {
        const { moduleId, id } = ModuleChildParam.parse(request.params);
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await records.getRecord(jwt.tenantId, moduleId, id) });
      });
      r.patch('/custom-modules/:moduleId/records/:id', DATA_WRITE, async (request, reply) => {
        const { moduleId, id } = ModuleChildParam.parse(request.params);
        const parsed = RecordBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await records.updateRecord(jwt.tenantId, moduleId, id, parsed.data.data) });
      });
      r.delete('/custom-modules/:moduleId/records/:id', DATA_WRITE, async (request, reply) => {
        const { moduleId, id } = ModuleChildParam.parse(request.params);
        const jwt = request.user as JwtPayload;
        await records.deleteRecord(jwt.tenantId, moduleId, id);
        return reply.send({ success: true, data: { id, deleted: true } });
      });

      // ── Formula preview (test a formula against sample data) ─────────────────
      // FAIL-OPEN: the engine is total, so this always returns 200 with an
      // { ok, value, error? } payload rather than throwing.
      r.post('/formula/evaluate', READ, async (request, reply) => {
        const parsed = FormulaEvalBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const result = evaluateFormula(parsed.data.formula, parsed.data.record);
        const value = result.value instanceof Date ? result.value.toISOString() : result.value;
        return reply.send({ success: true, data: { ok: result.ok, value, error: result.error } });
      });
    },
    { prefix: '/api/v1' }
  );
}
