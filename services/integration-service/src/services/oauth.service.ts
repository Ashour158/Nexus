import { randomBytes } from 'node:crypto';
import type { IntegrationPrisma } from '../prisma.js';
import type { createFieldCrypto } from '../lib/crypto.js';

type FieldCrypto = ReturnType<typeof createFieldCrypto>;

function getBase(provider: 'google' | 'microsoft') {
  if (provider === 'google') {
    return {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirectUri: process.env.GOOGLE_REDIRECT_URI ?? '',
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
    buildConnectUrl(provider: 'google' | 'microsoft', scope: string, stateSeed: string) {
      const base = getBase(provider);
      const state = `${stateSeed}:${randomBytes(8).toString('hex')}`;
      const params = new URLSearchParams({
        client_id: base.clientId,
        redirect_uri: base.redirectUri,
        response_type: 'code',
        scope,
        access_type: 'offline',
        prompt: 'consent',
        state,
      });
      return `${base.authUrl}?${params.toString()}`;
    },

    async exchangeCode(provider: 'google' | 'microsoft', code: string) {
      const base = getBase(provider);
      const form = new URLSearchParams({
        code,
        client_id: base.clientId,
        client_secret: base.clientSecret,
        redirect_uri: base.redirectUri,
        grant_type: 'authorization_code',
      });
      const res = await fetch(base.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      if (!res.ok) {
        throw new Error(`${provider} OAuth exchange failed`);
      }
      return (await res.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      };
    },

    async saveConnection(input: {
      tenantId: string;
      userId: string;
      provider: 'google' | 'microsoft';
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

    async listConnections(tenantId: string, userId: string) {
      return prisma.oAuthConnection.findMany({
        where: { tenantId, userId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async revokeConnection(tenantId: string, userId: string, provider: 'google' | 'microsoft') {
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
