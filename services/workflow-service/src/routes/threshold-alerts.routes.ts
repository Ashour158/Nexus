import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, ValidationError, requirePermission } from '@nexus/service-utils';
import type { WorkflowPrisma } from '../prisma.js';
import { createThresholdAlertsService, THRESHOLD_OPERATORS } from '../services/threshold-alerts.js';

const IdParamSchema = z.object({ id: z.string().cuid() });

const RuleShape = z.object({
  module: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  field: z.string().min(1).max(100),
  operator: z.enum(THRESHOLD_OPERATORS as unknown as [string, ...string[]]),
  value: z.unknown(),
  notifyRoles: z.array(z.string()).default([]),
  notifyUsers: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

const CreateSchema = RuleShape;
const UpdateSchema = RuleShape.partial();

const ListQuerySchema = z.object({
  module: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export async function registerThresholdAlertsRoutes(
  app: FastifyInstance,
  prisma: WorkflowPrisma
): Promise<void> {
  const svc = createThresholdAlertsService(prisma);

  await app.register(
    async (r) => {
      r.get(
        '/threshold-alerts',
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
        '/threshold-alerts',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.CREATE) },
        async (request, reply) => {
          const parsed = CreateSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await svc.create(jwt.tenantId, jwt.sub, parsed.data as never);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.get(
        '/threshold-alerts/:id',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const row = await svc.get(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.patch(
        '/threshold-alerts/:id',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const parsed = UpdateSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await svc.update(jwt.tenantId, id, parsed.data as never);
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/threshold-alerts/:id',
        { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.DELETE) },
        async (request, reply) => {
          const id = IdParamSchema.parse(request.params).id;
          const jwt = request.user as JwtPayload;
          const result = await svc.remove(jwt.tenantId, id);
          return reply.send({ success: true, data: result });
        }
      );

      r.post(
        '/threshold-alerts/:id/toggle',
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
