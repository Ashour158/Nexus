import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { createOauthService } from '../services/oauth.service.js';
import crypto from 'node:crypto';

const Provider = z.enum(['google', 'microsoft', 'slack']);

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
      void user;
      const state = crypto.randomBytes(32).toString('hex');
      (reply as any).setCookie('oauth_state', state, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
        signed: true,
      });
      const scope =
        provider === 'google'
          ? 'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send'
          : provider === 'slack'
            ? 'chat:write,users:read,users:read.email,channels:read,groups:read,im:read,mpim:read'
            : 'offline_access User.Read Mail.Read Mail.Send Calendars.ReadWrite';
      const url = oauth.buildConnectUrl(provider, scope, state);
      return reply.redirect(url);
    }
  );

  app.get(
    '/api/v1/integrations/oauth/:provider/callback',
    async (request, reply) => {
      const { provider } = z.object({ provider: Provider }).parse(request.params);
      const query = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(request.query);
      const cookie = (request as any).unsignCookie((request as any).cookies.oauth_state ?? '');
      if (!cookie.valid || cookie.value !== query.state) {
        return reply.code(403).send({ success: false, error: { code: 'INVALID_STATE', message: 'OAuth state mismatch — possible CSRF attack.' } });
      }
      const user = (request as unknown as { user: { tenantId: string; sub: string } }).user;
      const tokens = await oauth.exchangeCode(provider, query.code);
      let email: string | null = null;
      if (provider === 'slack' && tokens.access_token) {
        email = await oauth.getSlackUserInfo(tokens.access_token);
      }
      await oauth.saveConnection({
        tenantId: user.tenantId,
        userId: user.sub,
        provider,
        scope: tokens.scope ?? (provider === 'slack' ? 'chat:write,users:read' : 'calendar,email'),
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        email: email ?? undefined,
      });
      return reply.send({ success: true, data: { connected: true } });
    }
  );

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
