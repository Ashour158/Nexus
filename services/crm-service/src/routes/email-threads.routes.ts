import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import { z } from 'zod';
import type { CrmPrisma } from '../prisma.js';

const ListQuery = z.object({
  contactId: z.string().cuid().optional(),
  accountId: z.string().cuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const IdParam = z.object({ id: z.string().cuid() });

export async function registerEmailThreadsRoutes(app: FastifyInstance, prisma: CrmPrisma) {
  await app.register(
    async (r) => {
      r.get(
        '/email-threads',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const q = ListQuery.parse(request.query);
          const jwt = request.user as JwtPayload;
          const where = {
            tenantId: jwt.tenantId,
            contactId: q.contactId,
            accountId: q.accountId,
          };
          const data = await prisma.emailThread.findMany({
            where,
            skip: (q.page - 1) * q.limit,
            take: q.limit,
            orderBy: { lastMessageAt: 'desc' },
          });
          return reply.send({ success: true, data });
        }
      );

      r.get(
        '/email-threads/:id',
        { preHandler: requirePermission(PERMISSIONS.CONTACTS.READ) },
        async (request, reply) => {
          const { id } = IdParam.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await prisma.emailThread.findFirst({
            where: { tenantId: jwt.tenantId, id },
            include: { messages: { orderBy: { sentAt: 'desc' } } },
          });
          if (!data) return reply.code(404).send({ success: false, error: 'Not found' });
          return reply.send({ success: true, data });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
