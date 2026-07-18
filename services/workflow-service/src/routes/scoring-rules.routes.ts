import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';
import { createScoringService, SCORING_MODULES } from '../services/scoring.js';
import { SUPPORTED_OPERATORS } from '../services/automation-rules.service.js';

const IdParamSchema = z.object({ id: z.string().cuid() });

const ScoringConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(SUPPORTED_OPERATORS as [string, ...string[]]),
  value: z.unknown().optional(),
  points: z.number(),
});

const RuleShape = z.object({
  module: z.enum(SCORING_MODULES as unknown as [string, ...string[]]),
  name: z.string().min(1).max(200),
  conditions: z.array(ScoringConditionSchema).default([]),
  isActive: z.boolean().default(true),
});

const CreateRuleSchema = RuleShape;
const UpdateRuleSchema = RuleShape.partial();

const ListQuerySchema = z.object({
  module: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

const RecomputeSchema = z.object({
  module: z.enum(SCORING_MODULES as unknown as [string, ...string[]]),
  recordId: z.string().min(1),
  recordData: z.record(z.unknown()).default({}),
});

const ScoreQuerySchema = z.object({
  module: z.enum(SCORING_MODULES as unknown as [string, ...string[]]),
  recordId: z.string().min(1),
});

export async function registerScoringRulesRoutes(
  app: FastifyInstance,
  prisma: WorkflowPrisma
): Promise<void> {
  const svc = createScoringService(prisma);

  await app.register(
    async (r) => {
      r.get(
        '/scoring-rules',
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
        '/scoring-rules',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.CREATE) },
        async (request, reply) => {
          const parsed = CreateRuleSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await svc.create(jwt.tenantId, jwt.sub, parsed.data as never);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      // Recompute a record's score against all active rules and store it. Placed
      // before /:id so "recompute" is never captured as an id.
      r.post(
        '/scoring-rules/recompute',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (request, reply) => {
          const parsed = RecomputeSchema.safeParse(request.body ?? {});
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const result = await svc.recompute(
            jwt.tenantId,
            parsed.data.module,
            parsed.data.recordId,
            parsed.data.recordData
          );
          return reply.send({ success: true, data: result });
        }
      );

      // Read a record's stored score + breakdown.
      r.get(
        '/scoring-rules/score',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (request, reply) => {
          const parsed = ScoreQuerySchema.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const result = await svc.getScore(jwt.tenantId, parsed.data.module, parsed.data.recordId);
          return reply.send({ success: true, data: result });
        }
      );

      r.get(
        '/scoring-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const row = await svc.get(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.patch(
        '/scoring-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const parsed = UpdateRuleSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await svc.update(jwt.tenantId, id, parsed.data as never);
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/scoring-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.DELETE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const result = await svc.remove(jwt.tenantId, id);
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/scoring-rules/:id/toggle',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const row = await svc.toggle(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
