import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import type { AuthPrisma } from '../prisma.js';

export async function registerGdprRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma,
  producer: NexusProducer
): Promise<void> {
  await app.register(
    async (r) => {
      r.post('/gdpr/erasure', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (req, reply) => {
        const jwt = (req as unknown as { user: { tenantId: string; sub: string } }).user;
        const tenantId = jwt.tenantId;
        if (!tenantId) return reply.status(400).send({ error: 'Missing tenant context' });
        const body = (req.body ?? {}) as {
          subjectEmail?: string;
          subjectId?: string;
          requestedBy?: string;
        };
        if (!body.subjectEmail && !body.subjectId) {
          return reply.status(400).send({ error: 'subjectEmail or subjectId required' });
        }
        if (!body.requestedBy) {
          return reply.status(400).send({ error: 'requestedBy is required' });
        }

        const request = await prisma.gdprErasureRequest.create({
          data: {
            tenantId,
            subjectEmail: body.subjectEmail,
            subjectId: body.subjectId,
            requestedBy: body.requestedBy,
            status: 'PENDING',
          },
        });

        await producer.publish('gdpr.erasure.requested', {
          type: 'gdpr.erasure.requested',
          tenantId,
          payload: {
            requestId: request.id,
            tenantId,
            subjectEmail: body.subjectEmail,
            subjectId: body.subjectId,
            requestedAt: new Date().toISOString(),
          },
        });

        return reply.status(202).send({
          requestId: request.id,
          status: 'PENDING',
          message: 'Erasure request queued — data will be deleted within 24 hours',
        });
      });

      r.get('/gdpr/erasure/:requestId', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (req, reply) => {
        const jwt = (req as unknown as { user: { tenantId: string } }).user;
        const tenantId = jwt.tenantId;
        const { requestId } = req.params as { requestId: string };
        const request = await prisma.gdprErasureRequest.findFirst({
          where: { id: requestId, tenantId },
        });
        if (!request) return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Request not found', requestId: req.id } });
        return reply.send({ success: true, data: request });
      });

      r.post('/gdpr/export', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (req, reply) => {
        const jwt = (req as unknown as { user: { tenantId: string; sub: string } }).user;
        const tenantId = jwt.tenantId;
        if (!tenantId) return reply.status(400).send({ error: 'Missing tenant context' });
        const body = (req.body ?? {}) as {
          subjectEmail?: string;
          subjectId?: string;
          requestedBy?: string;
        };
        if (!body.subjectEmail && !body.subjectId) {
          return reply.status(400).send({ error: 'subjectEmail or subjectId required' });
        }
        if (!body.requestedBy) {
          return reply.status(400).send({ error: 'requestedBy is required' });
        }

        // Reuse GdprErasureRequest with EXPORT_PENDING status to track export requests
        const request = await prisma.gdprErasureRequest.create({
          data: {
            tenantId,
            subjectEmail: body.subjectEmail,
            subjectId: body.subjectId,
            requestedBy: body.requestedBy,
            status: 'EXPORT_PENDING',
          },
        });

        await producer.publish('gdpr.export.requested', {
          type: 'gdpr.export.requested',
          tenantId,
          payload: {
            requestId: request.id,
            tenantId,
            subjectEmail: body.subjectEmail,
            subjectId: body.subjectId,
            requestedAt: new Date().toISOString(),
          },
        });

        return reply.status(202).send({
          success: true,
          data: { requestId: request.id, status: 'EXPORT_PENDING', message: 'Data export request queued — export will be ready within 24 hours' },
        });
      });

      r.get('/gdpr/erasure', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (req, reply) => {
        const jwt = (req as unknown as { user: { tenantId: string } }).user;
        const tenantId = jwt.tenantId;
        const q = (req.query as Record<string, string>);
        const page = Math.max(1, Number(q.page ?? 1));
        const limit = Math.min(100, Math.max(1, Number(q.limit ?? 20)));
        const [total, requests] = await Promise.all([
          prisma.gdprErasureRequest.count({ where: { tenantId } }),
          prisma.gdprErasureRequest.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
        ]);
        return reply.send({ success: true, data: { rows: requests, total, page, limit } });
      });
    },
    { prefix: '/api/v1' }
  );
}
