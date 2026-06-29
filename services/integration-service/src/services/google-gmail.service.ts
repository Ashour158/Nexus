import { createHttpClient } from '@nexus/service-utils';
import type { IntegrationPrisma } from '../prisma.js';

const client = createHttpClient({
  baseURL: 'https://gmail.googleapis.com',
  timeoutMs: 10000,
  maxRetries: 3,
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
});

export function createGoogleGmailService(prisma: IntegrationPrisma) {
  return {
    async syncGmailThreads(tenantId: string, userId: string) {
      const conn = await prisma.oAuthConnection.findFirst({
        where: { tenantId, userId, provider: 'google' },
      });
      if (!conn) return { synced: 0 };
      try {
        const body = await client.get<{ threads?: Array<{ id: string }> }>(
          '/gmail/v1/users/me/threads?maxResults=50',
          { Authorization: `Bearer ${conn.accessToken}` }
        );
        return { synced: body.threads?.length ?? 0 };
      } catch {
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
      try {
        return await client.post(
          '/gmail/v1/users/me/messages/send',
          { raw },
          { Authorization: `Bearer ${conn.accessToken}` }
        );
      } catch {
        throw new Error('Gmail send failed');
      }
    },
  };
}
