import { createHttpClient } from '@nexus/service-utils';
import type { IntegrationPrisma } from '../prisma.js';
import type { createFieldCrypto } from '../lib/crypto.js';
import type { createOauthService } from './oauth.service.js';

type FieldCrypto = ReturnType<typeof createFieldCrypto>;
type OauthService = ReturnType<typeof createOauthService>;

const client = createHttpClient({
  baseURL: 'https://gmail.googleapis.com',
  timeoutMs: 10000,
  maxRetries: 3,
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
});

/** A NexusHttpClient 401 (expired/invalid access token). */
function isAuthError(err: unknown): boolean {
  const e = err as { statusCode?: number; code?: string } | null;
  return e?.statusCode === 401 || e?.code === 'HTTP_401';
}

/** True if the access token is missing an expiry or is within 60s of expiring. */
function nearExpiry(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - Date.now() < 60_000;
}

export function createGoogleGmailService(
  prisma: IntegrationPrisma,
  crypto: FieldCrypto,
  oauth?: OauthService
) {
  /** Decrypt the stored access token (plaintext rows pass through). */
  function readAccessToken(token: string): string {
    try {
      return crypto.decrypt(token);
    } catch {
      return token;
    }
  }

  return {
    async syncGmailThreads(tenantId: string, userId: string) {
      const conn = await prisma.oAuthConnection.findFirst({
        where: { tenantId, userId, provider: 'google' },
      });
      if (!conn) return { synced: 0 };

      let accessToken = readAccessToken(conn.accessToken);

      // Proactive refresh when the token is at/near expiry.
      if (oauth && nearExpiry(conn.expiresAt)) {
        const refreshed = await oauth.refreshAccessToken(tenantId, userId, 'google');
        if (refreshed) accessToken = refreshed;
      }

      const doList = (tok: string) =>
        client.get<{ threads?: Array<{ id: string }> }>(
          '/gmail/v1/users/me/threads?maxResults=50',
          { Authorization: `Bearer ${tok}` }
        );

      try {
        const body = await doList(accessToken);
        return { synced: body.threads?.length ?? 0 };
      } catch (err) {
        // Reactive refresh + single retry on 401.
        if (oauth && isAuthError(err)) {
          const refreshed = await oauth.refreshAccessToken(tenantId, userId, 'google');
          if (refreshed) {
            try {
              const body = await doList(refreshed);
              return { synced: body.threads?.length ?? 0 };
            } catch {
              return { synced: 0 };
            }
          }
        }
        return { synced: 0 };
      }
    },

    async sendEmail(
      tenantId: string,
      userId: string,
      to: string[],
      subject: string,
      body: string
    ) {
      const conn = await prisma.oAuthConnection.findFirst({
        where: { tenantId, userId, provider: 'google' },
      });
      if (!conn) throw new Error('No Google connection');
      const raw = Buffer.from(`To: ${to.join(',')}\r\nSubject: ${subject}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${body}`)
        .toString('base64')
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');

      let accessToken = readAccessToken(conn.accessToken);

      if (oauth && nearExpiry(conn.expiresAt)) {
        const refreshed = await oauth.refreshAccessToken(tenantId, userId, 'google');
        if (refreshed) accessToken = refreshed;
      }

      const doSend = (tok: string) =>
        client.post(
          '/gmail/v1/users/me/messages/send',
          { raw },
          { Authorization: `Bearer ${tok}` }
        );

      try {
        return await doSend(accessToken);
      } catch (err) {
        if (oauth && isAuthError(err)) {
          const refreshed = await oauth.refreshAccessToken(tenantId, userId, 'google');
          if (refreshed) {
            try {
              return await doSend(refreshed);
            } catch {
              throw new Error('Gmail send failed');
            }
          }
        }
        throw new Error('Gmail send failed');
      }
    },
  };
}
