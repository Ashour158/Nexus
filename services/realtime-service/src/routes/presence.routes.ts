import type { FastifyInstance } from 'fastify';
import { countPresence, listPresence } from '../socket/presence.js';

/**
 * Presence query endpoint. Returns the users currently connected via WebSocket
 * for the caller's tenant (as seen by this node). Auth + tenant are enforced by
 * the global `preHandler` in `createService`, which populates `request.user`.
 *
 * Additive + fail-open: on any unexpected error it returns an empty presence
 * list rather than surfacing a 500, so it never destabilizes the service.
 */
export function registerPresenceRoutes(app: FastifyInstance): void {
  app.get('/presence', async (request, reply) => {
    try {
      const tenantId = (request.user as { tenantId?: string } | undefined)?.tenantId;
      if (!tenantId) {
        return reply.send({ success: true, data: { count: 0, users: [] } });
      }
      const users = listPresence(tenantId);
      return reply.send({
        success: true,
        data: {
          count: countPresence(tenantId),
          users,
        },
      });
    } catch (err) {
      request.log.warn({ err }, 'presence query failed');
      return reply.send({ success: true, data: { count: 0, users: [] } });
    }
  });
}
