import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
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

function tokenClient(provider: OAuthProvider) {
  if (provider === 'google') return googleClient;
  if (provider === 'slack') return slackClient;
  return microsoftClient;
}

/* ── Signed OAuth state ───────────────────────────────────────────────────────
 * The provider callback is UNAUTHENTICATED, so tenant + user must be carried in
 * the OAuth `state` parameter. State is `<base64url(payload)>.<base64url(hmac)>`,
 * HMAC-SHA256-signed with JWT_SECRET so it cannot be forged, and time-bounded.
 */
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — matches the oauth_state cookie maxAge

function stateHmac(data: string): string {
  const secret = process.env.JWT_SECRET ?? '';
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function signOAuthState(payload: { tenantId: string; userId: string }): string {
  const body = { t: payload.tenantId, u: payload.userId, n: randomBytes(8).toString('hex'), iat: Date.now() };
  const json = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${json}.${stateHmac(json)}`;
}

export function verifyOAuthState(state: string): { tenantId: string; userId: string } | null {
  const dot = state.lastIndexOf('.');
  if (dot <= 0) return null;
  const json = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = stateHmac(json);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const body = JSON.parse(Buffer.from(json, 'base64url').toString('utf8')) as {
      t?: string;
      u?: string;
      iat?: number;
    };
    if (!body.t || !body.u || !body.iat) return null;
    if (Date.now() - body.iat > STATE_TTL_MS) return null; // expired
    return { tenantId: body.t, userId: body.u };
  } catch {
    return null;
  }
}

export function createOauthService(prisma: IntegrationPrisma, crypto: FieldCrypto) {
  async function markNeedsReauth(id: string, reason: string) {
    try {
      await prisma.oAuthConnection.update({
        where: { id },
        data: { syncStatus: 'FAILED', lastSyncError: `NEEDS_REAUTH: ${reason}`.slice(0, 500) },
      });
    } catch {
      // best-effort — never let a status write crash the caller
    }
  }

  return {
    signState: signOAuthState,
    verifyState: verifyOAuthState,

    /**
     * Use the stored (encrypted) refresh_token to mint a fresh access_token,
     * persist it encrypted, clear the error state, and return the new decrypted
     * access token. On any failure the connection is marked NEEDS_REAUTH and
     * null is returned — never throws.
     */
    async refreshAccessToken(
      tenantId: string,
      userId: string,
      provider: OAuthProvider
    ): Promise<string | null> {
      const conn = await prisma.oAuthConnection.findFirst({
        where: { tenantId, userId, provider },
      });
      if (!conn) return null;
      if (!conn.refreshToken) {
        await markNeedsReauth(conn.id, 'no refresh token on file');
        return null;
      }
      let refreshToken: string;
      try {
        refreshToken = crypto.decrypt(conn.refreshToken);
      } catch {
        refreshToken = conn.refreshToken; // back-compat: stored as plaintext
      }
      const base = getBase(provider);
      const form = new URLSearchParams({
        client_id: base.clientId,
        client_secret: base.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });
      try {
        let accessToken: string | undefined;
        let expiresIn: number | undefined;
        let newRefresh: string | undefined;
        if (provider === 'slack') {
          const r = (await tokenClient('slack').post('/oauth.v2.access', form.toString(), {
            'Content-Type': 'application/x-www-form-urlencoded',
          })) as {
            ok: boolean;
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            error?: string;
            authed_user?: { access_token?: string };
          };
          if (!r.ok) throw new Error(r.error ?? 'slack refresh failed');
          accessToken = r.authed_user?.access_token ?? r.access_token;
          expiresIn = r.expires_in;
          newRefresh = r.refresh_token;
        } else {
          const r = (await tokenClient(provider).post('/token', form.toString(), {
            'Content-Type': 'application/x-www-form-urlencoded',
          })) as { access_token?: string; refresh_token?: string; expires_in?: number };
          accessToken = r.access_token;
          expiresIn = r.expires_in;
          newRefresh = r.refresh_token;
        }
        if (!accessToken) throw new Error('no access_token in refresh response');
        const expiresAt = expiresIn && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;
        await prisma.oAuthConnection.update({
          where: { id: conn.id },
          data: {
            accessToken: crypto.encrypt(accessToken),
            ...(newRefresh ? { refreshToken: crypto.encrypt(newRefresh) } : {}),
            expiresAt,
            syncStatus: 'PENDING',
            lastSyncError: null,
          },
        });
        return accessToken;
      } catch (err) {
        await markNeedsReauth(conn.id, err instanceof Error ? err.message : 'refresh failed');
        return null;
      }
    },

    buildConnectUrl(provider: OAuthProvider, scope: string, state: string) {
      const base = getBase(provider);
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
