import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { z } from 'zod';
import type { createSequencesService } from '../services/sequences.service.js';

const StepSchema = z.object({
  stepNumber: z.number().int().min(0),
  delayDays: z.number().int().min(0),
  templateId: z.string(),
});

const CreateSeqSchema = z.object({
  name: z.string().min(1),
  triggerType: z.string().min(1),
  steps: z.array(StepSchema).min(1),
});

const PatchSeqSchema = z.object({
  name: z.string().optional(),
  triggerType: z.string().optional(),
  isActive: z.boolean().optional(),
});

const EnrollSchema = z.object({
  contactId: z.string().min(1),
});

export async function registerSequencesRoutes(
  app: FastifyInstance,
  sequences: ReturnType<typeof createSequencesService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/sequences',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const rows = await sequences.listSequences(jwt.tenantId);
          return reply.send({ success: true, data: rows });
        }
      );

      r.get(
        '/sequences/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string() }).parse(request.params);
          const jwt = request.user as JwtPayload;
          const row = await sequences.getSequenceById(jwt.tenantId, id);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/sequences',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreateSeqSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await sequences.createSequence(jwt.tenantId, parsed.data);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/sequences/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string() }).parse(request.params);
          const parsed = PatchSeqSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await sequences.updateSequence(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/sequences/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string() }).parse(request.params);
          const jwt = request.user as JwtPayload;
          await sequences.deleteSequence(jwt.tenantId, id);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      r.post(
        '/sequences/:id/enroll',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string() }).parse(request.params);
          const parsed = EnrollSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const row = await sequences.enrollContact(jwt.tenantId, id, parsed.data.contactId);
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.get(
        '/sequences/:id/enrollments',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string() }).parse(request.params);
          const jwt = request.user as JwtPayload;
          const rows = await sequences.listEnrollments(jwt.tenantId, id);
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/sequences/enrollments/:enrollmentId/unenroll',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { enrollmentId } = z.object({ enrollmentId: z.string() }).parse(request.params);
          const jwt = request.user as JwtPayload;
          await sequences.unenroll(jwt.tenantId, enrollmentId);
          return reply.send({ success: true, data: { enrollmentId, unsubscribed: true } });
        }
      );

      r.post(
        '/sequences/process-queue',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const n = await sequences.processSequenceQueue(jwt.tenantId);
          return reply.send({ success: true, data: { emailsSent: n } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
