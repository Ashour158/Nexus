import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';
import {
  AUTOMATION_MODULES,
  SUPPORTED_OPERATORS,
  buildMetaCatalog,
  createAutomationRulesService,
  type AutomationRuleInput,
} from '../services/automation-rules.service.js';
import { SUPPORTED_ACTION_TYPES } from '../engine/automation-actions.js';

const IdParamSchema = z.object({ id: z.string().cuid() });

const ConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(SUPPORTED_OPERATORS as [string, ...string[]]),
  value: z.unknown().optional(),
});

const ActionSchema = z.object({
  type: z.enum(SUPPORTED_ACTION_TYPES as [string, ...string[]]),
  config: z.record(z.unknown()).default({}),
});

const RuleShape = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  module: z.string().min(1).max(50),
  triggerEvent: z.string().min(1).max(100),
  conditions: z.array(ConditionSchema).default([]),
  actions: z.array(ActionSchema).min(1),
  isActive: z.boolean().default(true),
});

/**
 * Cross-field check: triggerEvent must belong to module per the AUTOMATION_MODULES
 * catalog. Skipped when either field is absent (partial PATCH) since we can't
 * resolve the pair without loading the existing rule.
 */
function refineTriggerForModule(
  val: { module?: string; triggerEvent?: string },
  ctx: z.RefinementCtx
): void {
  if (val.module === undefined || val.triggerEvent === undefined) return;
  const allowed = AUTOMATION_MODULES[val.module];
  if (!allowed) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['module'],
      message: `Unknown module "${val.module}"`,
    });
    return;
  }
  if (!allowed.includes(val.triggerEvent)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['triggerEvent'],
      message: `triggerEvent "${val.triggerEvent}" is not valid for module "${val.module}"`,
    });
  }
}

const CreateRuleSchema = RuleShape.superRefine(refineTriggerForModule);

const UpdateRuleSchema = RuleShape.partial().superRefine(refineTriggerForModule);

const ListQuerySchema = z.object({
  module: z.string().optional(),
  triggerEvent: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

const RunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const TestSchema = z.object({
  // A sample domain-event payload to evaluate the rule against (dry-run).
  payload: z.record(z.unknown()).default({}),
});

const VersionParamSchema = z.object({
  id: z.string().cuid(),
  version: z.coerce.number().int().min(1),
});

export async function registerAutomationRulesRoutes(
  app: FastifyInstance,
  prisma: WorkflowPrisma
): Promise<void> {
  const svc = createAutomationRulesService(prisma);

  await app.register(
    async (r) => {
      // Catalog for admin UI pickers (modules + trigger events + action types + operators)
      r.get(
        '/automation-rules/meta',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (_request, reply) => {
          return reply.send({ success: true, data: buildMetaCatalog() });
        }
      );

      r.get(
        '/automation-rules',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (request, reply) => {
          const parsed = ListQuerySchema.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const rows = await svc.list(jwt.tenantId, parsed.data);
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/automation-rules',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.CREATE) },
        async (request, reply) => {
          const parsed = CreateRuleSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await svc.create(jwt.tenantId, jwt.sub, parsed.data as AutomationRuleInput);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.get(
        '/automation-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const row = await svc.get(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.patch(
        '/automation-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const parsed = UpdateRuleSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await svc.update(jwt.tenantId, id, parsed.data as Partial<AutomationRuleInput>, jwt.sub);
          return reply.send({ success: true, data: row });
        }
      );

      // ─── AU-3: dry-run / test ────────────────────────────────────────────
      // Evaluate conditions against a sample payload and SIMULATE the actions
      // (resolve target URL/body/event — no side effects, no run recorded).
      r.post(
        '/automation-rules/:id/test',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const parsed = TestSchema.safeParse(request.body ?? {});
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const result = await svc.test(jwt.tenantId, id, parsed.data.payload);
          return reply.send({ success: true, data: result });
        }
      );

      // ─── AU-3: version history + rollback ────────────────────────────────
      r.get(
        '/automation-rules/:id/versions',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const rows = await svc.listVersions(jwt.tenantId, id);
          return reply.send({ success: true, data: rows });
        }
      );

      r.get(
        '/automation-rules/:id/versions/:version',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (request, reply) => {
          const params = VersionParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const row = await svc.getVersion(jwt.tenantId, params.id, params.version);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/automation-rules/:id/rollback/:version',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) },
        async (request, reply) => {
          const params = VersionParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const result = await svc.rollback(jwt.tenantId, params.id, params.version, jwt.sub);
          return reply.send({ success: true, data: result });
        }
      );

      r.delete(
        '/automation-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.DELETE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const result = await svc.remove(jwt.tenantId, id);
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/automation-rules/:id/toggle',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const row = await svc.toggle(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.get(
        '/automation-rules/:id/runs',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const parsed = RunsQuerySchema.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const rows = await svc.listRuns(jwt.tenantId, id, parsed.data.limit);
          return reply.send({ success: true, data: rows });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
