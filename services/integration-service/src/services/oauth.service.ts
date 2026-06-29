import { randomBytes } from 'node:crypto';
import { createHttpClient } from '@nexus/service-utils';
import type { IntegrationPrisma } from '../prisma.js';
import type { createFieldCrypto } from '../lib/crypto.js';

type FieldCrypto = ReturnType<typeof createFieldCrypto>;

type OAuthProvider = 'google' | 'microsoft' | 'slack';

const googleClient = createHttpClient({
  baseURL: 'https://oauth2.googleapis.com',
  timeoutMs: 10000,
  maxRetries: 3,
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
});

const microsoftClient = createHttpClient({
  baseURL: 'https://login.microsoftonline.com/common/oauth2/v2.0',
  timeoutMs: 10000,
  maxRetries: 3,
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
});

const slackClient = createHttpClient({
  baseURL: 'https://slack.com/api',
  timeoutMs: 10000,
  maxRetries: 3,
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
});

function getBase(provider: OAuthProvider) {
  if (provider === 'google') {
    return {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI ?? '',
    };
  }
  if (provider === 'slack') {
    return {
      authUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      clientId: process.env.SLACK_CLIENT_ID ?? '',
      clientSecret: process.env.SLACK_CLIENT_SECRET ?? '',
      redirectUri: process.env.SLACK_REDIRECT_URI ?? '',
    };
  }
  return {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId: process.env.MICROSOFT_CLIENT_ID ?? '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
    redirectUri: process.env.MICROSOFT_REDIRECT_URI ?? '',
  };
}

export function createOauthService(prisma: IntegrationPrisma, crypto: FieldCrypto) {
  return {
    buildConnectUrl(provider: OAuthProvider, scope: string, stateSeed: string) {
      const base = getBase(provider);
      const state = `${stateSeed}:${randomBytes(8).toString('hex')}`;
      const params = new URLSearchParams({
        client_id: base.clientId,
        redirect_uri: base.redirectUri,
        response_type: 'code',
        scope,
        state,
      });
      if (provider !== 'slack') {
        params.set('access_type', 'offline');
        params.set('prompt', 'consent');
      }
      if (provider === 'slack') {
        params.set('user_scope', scope);
      }
      return `${base.authUrl}?${params.toString()}`;
    },

    async exchangeCode(provider: OAuthProvider, code: string) {
      const base = getBase(provider);
      let client = microsoftClient;
      if (provider === 'google') client = googleClient;
      if (provider === 'slack') client = slackClient;
      const form = new URLSearchParams({
        code,
        client_id: base.clientId,
        client_secret: base.clientSecret,
        redirect_uri: base.redirectUri,
        grant_type: 'authorization_code',
      });
      try {
        if (provider === 'slack') {
          const result = (await client.post('/oauth.v2.access', form.toString(), {
            'Content-Type': 'application/x-www-form-urlencoded',
          })) as {
            ok: boolean;
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            scope?: string;
            error?: string;
            authed_user?: { access_token?: string; scope?: string };
          };
          if (!result.ok) throw new Error(`Slack OAuth error: ${result.error ?? 'unknown'}`);
          // Use user token for API calls (bot token is for workspace-wide actions)
          const userToken = result.authed_user?.access_token ?? result.access_token ?? '';
          const userScope = result.authed_user?.scope ?? result.scope ?? 'chat:write,users:read';
          return {
            access_token: userToken,
            refresh_token: result.refresh_token,
            expires_in: result.expires_in,
            scope: userScope,
          };
        }
        return (await client.post('/token', form.toString(), {
          'Content-Type': 'application/x-www-form-urlencoded',
        })) as {
          access_token: string;
          refresh_token?: string;
          expires_in?: number;
          scope?: string;
        };
      } catch {
        throw new Error(`${provider} OAuth exchange failed`);
      }
    },

    async saveConnection(input: {
      tenantId: string;
      userId: string;
      provider: OAuthProvider;
      scope: string;
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
      email?: string;
    }) {
      const existing = await prisma.oAuthConnection.findFirst({
        where: {
          tenantId: input.tenantId,
          userId: input.userId,
          provider: input.provider,
          scope: input.scope,
        },
      });
      const expiresAt =
        input.expiresIn && input.expiresIn > 0
          ? new Date(Date.now() + input.expiresIn * 1000)
          : null;
      const data = {
        accessToken: crypto.encrypt(input.accessToken),
        refreshToken: input.refreshToken ? crypto.encrypt(input.refreshToken) : null,
        expiresAt,
        email: input.email ?? null,
      };
      if (existing) {
        return prisma.oAuthConnection.update({ where: { id: existing.id }, data });
      }
      return prisma.oAuthConnection.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          provider: input.provider,
          scope: input.scope,
          ...data,
        },
      });
    },

    async getSlackUserInfo(accessToken: string) {
      try {
        const res = (await slackClient.post('/users.identity', '', {
          Authorization: `Bearer ${accessToken}`,
        })) as { ok: boolean; user?: { email?: string }; error?: string };
        if (res.ok && res.user?.email) return res.user.email;
      } catch {
        // ignore
      }
      return null;
    },

    async listConnections(tenantId: string, userId: string) {
      return prisma.oAuthConnection.findMany({
        where: { tenantId, userId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async revokeConnection(tenantId: string, userId: string, provider: OAuthProvider) {
      const rows = await prisma.oAuthConnection.findMany({
        where: { tenantId, userId, provider },
      });
      if (rows.length === 0) return 0;
      await prisma.oAuthConnection.deleteMany({
        where: { tenantId, userId, provider },
      });
      return rows.length;
    },
  };
}
