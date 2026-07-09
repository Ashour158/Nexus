import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { ValidationError } from '@nexus/service-utils';
import type { PreferencesService } from '../services/preferences.service.js';
import { NOTIFICATION_CHANNELS } from '../services/preferences.service.js';

/**
 * Notification preferences (NOT-11) — self-service per-channel opt-out.
 *
 * These endpoints are auth-only (no extra RBAC permission): a user may only ever
 * read and mutate their OWN preferences. `tenantId` + `userId` are taken from the
 * JWT, never from the request body, so one user can never touch another's prefs.
 *
 *   GET /notifications/preferences  → effective per-channel enabled map.
 *   PUT /notifications/preferences  → upsert one channel's enabled flag.
 */

const UpdateSchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS),
  enabled: z.boolean(),
});

export async function registerPreferencesRoutes(
  app: FastifyInstance,
  prefs: PreferencesService
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/notifications/preferences', async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const data = await prefs.getEffectivePreferences(jwt.tenantId, jwt.sub);
        return reply.send({ success: true, data });
      });

      r.put('/notifications/preferences', async (request, reply) => {
        const parsed = UpdateSchema.safeParse(request.body);
        if (!parsed.success) {
          throw new ValidationError('Invalid preference', parsed.error.flatten());
        }
        const jwt = request.user as JwtPayload;
        const data = await prefs.setChannelEnabled(
          jwt.tenantId,
          jwt.sub,
          parsed.data.channel,
          parsed.data.enabled
        );
        return reply.send({ success: true, data });
      });
    },
    { prefix: '/api/v1' }
  );
}
