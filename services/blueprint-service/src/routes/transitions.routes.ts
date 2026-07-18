import type { FastifyInstance, FastifyRequest } from 'fastify';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import { z } from 'zod';
import type { Actor, TransitionsService } from '../services/transitions.service.js';

// ─── Zod schemas (kept local; blueprint-service owns this feature) ────────────

const RuleSchema = z
  .object({
    type: z.enum(['required_field', 'min_value', 'activity_completed', 'contact_linked']),
    field: z.string().optional(),
    minValue: z.number().optional(),
    activityType: z.string().optional(),
    errorMessage: z.string().optional(),
  })
  .passthrough();

const BeforeConditionsSchema = z
  .object({
    criteria: z.array(RuleSchema).optional(),
    allowedRoles: z.array(z.string()).optional(),
  })
  .passthrough();

const DuringConfigSchema = z
  .object({
    mandatoryFields: z.array(z.string()).optional(),
    mandatoryActions: z
      .array(z.object({ id: z.string(), label: z.string().optional() }).passthrough())
      .optional(),
    checklist: z
      .array(
        z
          .object({ id: z.string(), label: z.string().optional(), required: z.boolean().optional() })
          .passthrough()
      )
      .optional(),
    message: z.string().optional(),
  })
  .passthrough();

const AfterActionsSchema = z
  .object({
    fieldUpdates: z.array(z.object({ field: z.string(), value: z.unknown() }).passthrough()).optional(),
    alerts: z.array(z.record(z.unknown())).optional(),
    tasks: z.array(z.record(z.unknown())).optional(),
    functions: z.array(z.object({ name: z.string() }).passthrough()).optional(),
  })
  .passthrough();

const EscalationConfigSchema = z
  .object({
    notifyUserIds: z.array(z.string()).optional(),
    notifyRoles: z.array(z.string()).optional(),
    reassignTo: z.string().optional(),
    message: z.string().optional(),
    alerts: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough();

const CreateTransitionSchema = z.object({
  name: z.string().min(1),
  fromStageId: z.string().min(1),
  toStageId: z.string().min(1),
  beforeConditions: BeforeConditionsSchema.optional(),
  duringConfig: DuringConfigSchema.optional(),
  afterActions: AfterActionsSchema.optional(),
  slaMinutes: z.number().int().positive().nullable().optional(),
  escalationConfig: EscalationConfigSchema.nullable().optional(),
});

const UpdateTransitionSchema = CreateTransitionSchema.partial();

const PlaybookIdParam = z.object({ id: z.string().min(1) });
const TransitionIdParam = z.object({ id: z.string().min(1), transitionId: z.string().min(1) });
const RecordParam = z.object({ module: z.string().min(1), recordId: z.string().min(1) });

const AvailableQuery = z.object({
  playbookId: z.string().min(1).optional(),
  currentStageId: z.string().min(1).optional(),
});

const PerformTransitionSchema = z.object({
  transitionId: z.string().min(1),
  data: z.record(z.unknown()).optional(),
  checklist: z.record(z.unknown()).optional(),
});

/** Resolve the calling user's identity/roles from the verified JWT. */
function actorFrom(request: FastifyRequest): Actor {
  const user = (request as unknown as { user?: { sub?: string; roles?: string[] } }).user;
  return { userId: user?.sub, roles: Array.isArray(user?.roles) ? user.roles : [] };
}

export async function registerTransitionsRoutes(
  app: FastifyInstance,
  transitions: TransitionsService
): Promise<void> {
  await app.register(
    async (r) => {
      // ── Transition CRUD (blueprints:manage) ──────────────────────────────
      r.get(
        '/blueprints/playbooks/:id/transitions',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.MANAGE) },
        async (request, reply) => {
          const p = PlaybookIdParam.safeParse(request.params);
          if (!p.success) throw new ValidationError('Invalid params', p.error.flatten());
          const rows = await transitions.list(p.data.id);
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/blueprints/playbooks/:id/transitions',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.MANAGE) },
        async (request, reply) => {
          const p = PlaybookIdParam.safeParse(request.params);
          if (!p.success) throw new ValidationError('Invalid params', p.error.flatten());
          const body = CreateTransitionSchema.safeParse(request.body);
          if (!body.success) throw new ValidationError('Invalid body', body.error.flatten());
          const row = await transitions.create(p.data.id, body.data);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/blueprints/playbooks/:id/transitions/:transitionId',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.MANAGE) },
        async (request, reply) => {
          const p = TransitionIdParam.safeParse(request.params);
          if (!p.success) throw new ValidationError('Invalid params', p.error.flatten());
          const body = UpdateTransitionSchema.safeParse(request.body);
          if (!body.success) throw new ValidationError('Invalid body', body.error.flatten());
          const row = await transitions.update(p.data.id, p.data.transitionId, body.data);
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/blueprints/playbooks/:id/transitions/:transitionId',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.MANAGE) },
        async (request, reply) => {
          const p = TransitionIdParam.safeParse(request.params);
          if (!p.success) throw new ValidationError('Invalid params', p.error.flatten());
          await transitions.delete(p.data.id, p.data.transitionId);
          return reply.send({ success: true, data: { id: p.data.transitionId, deleted: true } });
        }
      );

      // ── Advance flow (blueprints:read) ───────────────────────────────────
      r.get(
        '/blueprints/records/:module/:recordId/state',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.READ) },
        async (request, reply) => {
          const p = RecordParam.safeParse(request.params);
          if (!p.success) throw new ValidationError('Invalid params', p.error.flatten());
          const row = await transitions.getRecordState(p.data.module, p.data.recordId);
          return reply.send({ success: true, data: row });
        }
      );

      r.get(
        '/blueprints/records/:module/:recordId/available-transitions',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.READ) },
        async (request, reply) => {
          const p = RecordParam.safeParse(request.params);
          if (!p.success) throw new ValidationError('Invalid params', p.error.flatten());
          const q = AvailableQuery.safeParse(request.query);
          if (!q.success) throw new ValidationError('Invalid query', q.error.flatten());
          const data = await transitions.availableTransitions(
            p.data.module,
            p.data.recordId,
            actorFrom(request),
            q.data
          );
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/blueprints/records/:module/:recordId/transition',
        { preHandler: requirePermission(PERMISSIONS.BLUEPRINTS.READ) },
        async (request, reply) => {
          const p = RecordParam.safeParse(request.params);
          if (!p.success) throw new ValidationError('Invalid params', p.error.flatten());
          const body = PerformTransitionSchema.safeParse(request.body);
          if (!body.success) throw new ValidationError('Invalid body', body.error.flatten());
          const correlationId =
            (request.headers['x-correlation-id'] as string | undefined) ?? request.id;
          const data = await transitions.performTransition(
            p.data.module,
            p.data.recordId,
            body.data,
            actorFrom(request),
            correlationId
          );
          return reply.send({ success: true, data });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
