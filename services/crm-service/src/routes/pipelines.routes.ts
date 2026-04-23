import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import {
  CreatePipelineSchema,
  CreateStageSchema,
  IdParamSchema,
  UpdatePipelineSchema,
  UpdateStageSchema,
} from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';
import { createPipelinesService } from '../services/pipelines.service.js';

const PipelineStageParamsSchema = z.object({
  id: z.string().cuid(),
  stageId: z.string().cuid(),
});

/**
 * Registers the `/api/v1/pipelines/*` route family — Section 34.2.
 *
 * Pipelines are reference data consumed by every deal write; reads use the
 * `SETTINGS.READ` permission so non-admin users can still fetch them for
 * dropdowns, while writes require `SETTINGS.UPDATE`.
 */
export async function registerPipelinesRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma
): Promise<void> {
  const pipelines = createPipelinesService(prisma);

  await app.register(
    async (r) => {
      r.get(
        '/pipelines',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const rows = await pipelines.listPipelines(jwt.tenantId);
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/pipelines',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreatePipelineSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const pipeline = await pipelines.createPipeline(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: pipeline });
        }
      );

      r.get(
        '/pipelines/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const pipeline = await pipelines.getPipelineById(jwt.tenantId, id);
          return reply.send({ success: true, data: pipeline });
        }
      );

      r.patch(
        '/pipelines/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = UpdatePipelineSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const pipeline = await pipelines.updatePipeline(
            jwt.tenantId,
            id,
            parsed.data
          );
          return reply.send({ success: true, data: pipeline });
        }
      );

      r.delete(
        '/pipelines/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await pipelines.deletePipeline(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      // ─── Stages ────────────────────────────────────────────────────────
      r.get(
        '/pipelines/:id/stages',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const stages = await pipelines.listStages(jwt.tenantId, id);
          return reply.send({ success: true, data: stages });
        }
      );

      r.post(
        '/pipelines/:id/stages',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = CreateStageSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const stage = await pipelines.createStage(jwt.tenantId, id, parsed.data);
          return reply.code(201).send({ success: true, data: stage });
        }
      );

      r.patch(
        '/pipelines/:id/stages/:stageId',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id, stageId } = PipelineStageParamsSchema.parse(request.params);
          const parsed = UpdateStageSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const stage = await pipelines.updateStage(
            jwt.tenantId,
            id,
            stageId,
            parsed.data
          );
          return reply.send({ success: true, data: stage });
        }
      );

      r.delete(
        '/pipelines/:id/stages/:stageId',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id, stageId } = PipelineStageParamsSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          await pipelines.deleteStage(jwt.tenantId, id, stageId);
          return reply.send({ success: true, data: { id: stageId, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
