import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';
import { createEscalationService, TIER_ACTIONS } from '../services/escalation.js';
import { SUPPORTED_OPERATORS } from '../services/automation-rules.service.js';

const IdParamSchema = z.object({ id: z.string().cuid() });

const CriteriaSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(SUPPORTED_OPERATORS as [string, ...string[]]),
  value: z.unknown().optional(),
});

const TierSchema = z.object({
  afterMinutes: z.number().min(0),
  action: z.enum(TIER_ACTIONS as unknown as [string, ...string[]]),
  target: z.string().optional(),
  params: z.record(z.unknown()).optional(),
});

const RuleShape = z.object({
  module: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  criteria: z.array(CriteriaSchema).optional(),
  tiers: z.array(TierSchema).min(1),
  businessHoursOnly: z.boolean().default(false),
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

const StartSchema = z.object({
  module: z.string().min(1).max(50).optional(),
  recordId: z.string().min(1),
  recordData: z.record(z.unknown()).default({}),
});

const InstancesQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'RESOLVED', 'COMPLETED', 'FIRING']).optional(),
});

export async function registerEscalationRulesRoutes(
  app: FastifyInstance,
  prisma: WorkflowPrisma
): Promise<void> {
  const svc = createEscalationService(prisma);

  await app.register(
    async (r) => {
      r.get(
        '/escalation-rules',
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
        '/escalation-rules',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.CREATE) },
        async (request, reply) => {
          const parsed = CreateRuleSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await svc.create(jwt.tenantId, jwt.sub, parsed.data as never);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.get(
        '/escalation-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const row = await svc.get(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.patch(
        '/escalation-rules/:id',
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
        '/escalation-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.DELETE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const result = await svc.remove(jwt.tenantId, id);
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/escalation-rules/:id/toggle',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const row = await svc.toggle(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      // Open an escalation instance for a record against this rule.
      r.post(
        '/escalation-rules/:id/start',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const parsed = StartSchema.safeParse(request.body ?? {});
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await svc.startInstance(
            jwt.tenantId,
            id,
            parsed.data.module,
            parsed.data.recordId,
            parsed.data.recordData
          );
          return reply.code(201).send({ success: true, data: row });
        }
      );

      // List a rule's instances.
      r.get(
        '/escalation-rules/:id/instances',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const parsed = InstancesQuerySchema.safeParse(request.query);
          if (!parsed.success) throw new ValidationError('Invalid query', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const rows = await svc.listInstances(jwt.tenantId, id, parsed.data.status);
          return reply.send({ success: true, data: rows });
        }
      );

      // Resolve (stop) an instance early — record replied / closed.
      r.post(
        '/escalation-rules/instances/:id/resolve',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const row = await svc.resolveInstance(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
