import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createOauthService } from '../services/oauth.service.js';

const Provider = z.enum(['google', 'microsoft']);

export async function registerOauthRoutes(
  app: FastifyInstance,
  oauth: ReturnType<typeof createOauthService>
) {
  app.get(
    '/api/v1/integrations/oauth/:provider/connect',
    { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.MANAGE) },
    async (request, reply) => {
      const { provider } = z.object({ provider: Provider }).parse(request.params);
      const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
      const scope =
        provider === 'google'
          ? 'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send'
          : 'offline_access User.Read Mail.Read Mail.Send Calendars.ReadWrite';
      const url = oauth.buildConnectUrl(provider, scope, `${user.tenantId}:${user.sub}`);
      return reply.redirect(url);
    }
  );

  app.get('/api/v1/integrations/oauth/:provider/callback', async (request, reply) => {
    const { provider } = z.object({ provider: Provider }).parse(request.params);
    const query = z.object({ code: z.string().min(1), state: z.string().optional() }).parse(request.query);
    const tokens = await oauth.exchangeCode(provider, query.code);
    const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
    await oauth.saveConnection({
      tenantId: user.tenantId,
      userId: user.sub,
      provider,
      scope: tokens.scope ?? 'calendar,email',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });
    return reply.send({ success: true, data: { connected: true } });
  });

  app.get(
    '/api/v1/integrations/oauth/connections',
    { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.READ) },
    async (request, reply) => {
      const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
      const data = await oauth.listConnections(user.tenantId, user.sub);
      return reply.send({ success: true, data });
    }
  );

  app.delete(
    '/api/v1/integrations/oauth/:provider',
    { preHandler: requirePermission(PERMISSIONS.INTEGRATIONS.MANAGE) },
    async (request, reply) => {
      const { provider } = z.object({ provider: Provider }).parse(request.params);
      const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
      const removed = await oauth.revokeConnection(user.tenantId, user.sub, provider);
      return reply.send({ success: true, data: { removed } });
    }
  );
}
