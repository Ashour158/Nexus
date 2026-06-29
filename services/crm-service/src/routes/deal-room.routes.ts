import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { CrmPrisma } from '../prisma.js';

function newRoomSlug(): string {
  return randomBytes(16).toString('hex');
}

export async function registerDealRoomRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  /** Public viewer — JWT skipped via `isPublicRoute` when published */
  app.get('/api/v1/deal-rooms/:slug/public', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const found = await prisma.dealRoom.findUnique({
      where: { slug },
      include: {
        items: { orderBy: { position: 'asc' } },
        documents: { orderBy: { createdAt: 'desc' } },
        deal: { select: { name: true } },
      },
    });
    if (!found || !found.isPublished) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Deal room not found or not published', requestId: request.id } });
    }
    const room = await prisma.dealRoom.update({
      where: { id: found.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
      include: {
        items: { orderBy: { position: 'asc' } },
        documents: { orderBy: { createdAt: 'desc' } },
        deal: { select: { name: true } },
      },
    });
    return reply.send({ success: true, data: room });
  });

  await app.register(
    async (r) => {
      r.get(
        '/deals/:dealId/room',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { dealId } = request.params as { dealId: string };

          let room = await prisma.dealRoom.findFirst({
            where: { dealId, tenantId: jwt.tenantId },
            include: {
              items: { orderBy: { position: 'asc' } },
              documents: { orderBy: { createdAt: 'desc' } },
              deal: { select: { name: true, accountId: true } },
            },
          });

          if (!room) {
            const deal = await prisma.deal.findFirst({
              where: { id: dealId, tenantId: jwt.tenantId },
              select: { name: true },
            });
            if (!deal) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Deal not found', requestId: request.id } });

            room = await prisma.dealRoom.create({
              data: {
                tenantId: jwt.tenantId,
                dealId,
                title: `${deal.name} — Deal Room`,
                slug: newRoomSlug(),
                isPublished: false,
              },
              include: {
                items: true,
                documents: true,
                deal: { select: { name: true, accountId: true } },
              },
            });
          }

          return reply.send({ success: true, data: room });
        }
      );

      r.patch(
        '/deals/:dealId/room',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { dealId } = request.params as { dealId: string };
          const body = request.body as {
            title?: string;
            isPublished?: boolean;
            buyerEmails?: string[];
          };

          const room = await prisma.dealRoom.findFirst({
            where: { dealId, tenantId: jwt.tenantId },
          });
          if (!room) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Deal room not found', requestId: request.id } });

          const data: Prisma.DealRoomUpdateInput = {};
          if (body.title !== undefined) data.title = body.title;
          if (body.isPublished !== undefined) data.isPublished = body.isPublished;
          if (body.buyerEmails !== undefined)
            data.buyerEmails = body.buyerEmails as unknown as Prisma.InputJsonValue;

          const updated = await prisma.dealRoom.update({
            where: { id: room.id },
            data,
          });
          return reply.send({ success: true, data: updated });
        }
      );

      r.post(
        '/deals/:dealId/room/items',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { dealId } = request.params as { dealId: string };
          const body = request.body as {
            title: string;
            description?: string;
            owner: 'rep' | 'buyer';
            ownerName?: string;
            dueDate?: string;
            position?: number;
          };

          const room = await prisma.dealRoom.findFirst({
            where: { dealId, tenantId: jwt.tenantId },
            select: { id: true },
          });
          if (!room) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Deal room not found', requestId: request.id } });
          if (body.owner !== 'rep' && body.owner !== 'buyer') {
            return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'owner must be rep or buyer', requestId: request.id } });
          }

          const item = await prisma.mutualActionItem.create({
            data: {
              dealRoomId: room.id,
              title: body.title,
              description: body.description,
              owner: body.owner,
              ownerName: body.ownerName,
              dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
              position: body.position ?? 0,
            },
          });
          return reply.code(201).send({ success: true, data: item });
        }
      );

      r.patch(
        '/deals/:dealId/room/items/:itemId',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { dealId, itemId } = request.params as { dealId: string; itemId: string };
          const body = request.body as {
            title?: string;
            completedAt?: string | null;
            dueDate?: string | null;
            position?: number;
          };

          const room = await prisma.dealRoom.findFirst({
            where: { dealId, tenantId: jwt.tenantId },
            select: { id: true },
          });
          if (!room) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Deal room not found', requestId: request.id } });

          const item = await prisma.mutualActionItem.findFirst({
            where: { id: itemId, dealRoomId: room.id },
          });
          if (!item) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found', requestId: request.id } });

          const data: Prisma.MutualActionItemUpdateInput = {};
          if (body.title !== undefined) data.title = body.title;
          if (body.position !== undefined) data.position = body.position;
          if (body.completedAt === null) data.completedAt = null;
          else if (body.completedAt !== undefined) data.completedAt = new Date(body.completedAt);
          if (body.dueDate === null) data.dueDate = null;
          else if (body.dueDate !== undefined) data.dueDate = new Date(body.dueDate);

          const updated = await prisma.mutualActionItem.update({
            where: { id: itemId },
            data,
          });
          return reply.send({ success: true, data: updated });
        }
      );

      r.delete(
        '/deals/:dealId/room/items/:itemId',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { dealId, itemId } = request.params as { dealId: string; itemId: string };

          const room = await prisma.dealRoom.findFirst({
            where: { dealId, tenantId: jwt.tenantId },
            select: { id: true },
          });
          if (!room) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Deal room not found', requestId: request.id } });

          const item = await prisma.mutualActionItem.findFirst({
            where: { id: itemId, dealRoomId: room.id },
          });
          if (!item) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Item not found', requestId: request.id } });

          await prisma.mutualActionItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });
          return reply.send({ success: true });
        }
      );

      r.post(
        '/deals/:dealId/room/documents',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { dealId } = request.params as { dealId: string };
          const body = request.body as {
            name: string;
            url: string;
            fileType?: string;
            uploadedBy: string;
          };

          const room = await prisma.dealRoom.findFirst({
            where: { dealId, tenantId: jwt.tenantId },
            select: { id: true },
          });
          if (!room) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Deal room not found', requestId: request.id } });

          const doc = await prisma.dealRoomDocument.create({
            data: {
              dealRoomId: room.id,
              name: body.name,
              url: body.url,
              fileType: body.fileType,
              uploadedBy: body.uploadedBy,
            },
          });
          return reply.code(201).send({ success: true, data: doc });
        }
      );

      r.delete(
        '/deals/:dealId/room/documents/:docId',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { dealId, docId } = request.params as { dealId: string; docId: string };

          const room = await prisma.dealRoom.findFirst({
            where: { dealId, tenantId: jwt.tenantId },
            select: { id: true },
          });
          if (!room) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Deal room not found', requestId: request.id } });

          const doc = await prisma.dealRoomDocument.findFirst({
            where: { id: docId, dealRoomId: room.id },
          });
          if (!doc) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Document not found', requestId: request.id } });

          await prisma.dealRoomDocument.update({ where: { id: docId }, data: { deletedAt: new Date() } });
          return reply.send({ success: true });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
