import type { FastifyInstance } from 'fastify';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { ChatbotPrisma } from '../prisma.js';

/**
 * Agent-facing conversation list for the /chatbot admin page.
 *
 * This endpoint did not exist. The page has always called
 * `GET /api/v1/conversations` and got a 404 — first invisibly, because it was
 * fetching NEXT_PUBLIC_CHATBOT_URL (default http://localhost:3017) straight from
 * the browser and the cross-origin failure looked like an empty list, and then
 * visibly once that call was moved onto the /bff/chatbot proxy.
 *
 * Note the distinction from `/api/v1/chat/*`: those routes serve the PUBLIC
 * website widget and are in `publicPrefixes`, authenticated per-session by an
 * embed key + session token. This one is staff-facing, so it sits outside that
 * prefix and takes the normal JWT + permission path, and every query is scoped
 * by the caller's tenantId.
 */
export async function registerConversationsRoutes(
  app: FastifyInstance,
  prisma: ChatbotPrisma
): Promise<void> {
  app.get(
    '/api/v1/conversations',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (request, reply) => {
      const { tenantId } = (request as unknown as { user: { tenantId: string } }).user;
      const {
        channel,
        state,
        limit = '50',
        offset = '0',
      } = request.query as { channel?: string; state?: string; limit?: string; offset?: string };

      // Clamp paging so a caller cannot ask for the whole table.
      const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
      const skip = Math.max(Number(offset) || 0, 0);

      const where: Record<string, unknown> = { tenantId };
      if (channel) where.channel = channel;
      if (state) where.state = state;

      const [total, rows] = await Promise.all([
        prisma.conversation.count({ where }),
        prisma.conversation.findMany({
          where,
          orderBy: { lastMessageAt: 'desc' },
          take,
          skip,
          select: {
            id: true,
            channel: true,
            externalId: true,
            state: true,
            lastMessageAt: true,
            contactId: true,
            leadId: true,
            visitorName: true,
            visitorEmail: true,
            createdAt: true,
          },
        }),
      ]);

      // `data` is the array the web page reads directly; total/limit/offset ride
      // alongside for paging without changing that contract.
      return reply.send({ success: true, data: rows, total, limit: take, offset: skip });
    }
  );
}
