import type { IntegrationPrisma } from '../prisma.js';

export function createGoogleGmailService(prisma: IntegrationPrisma) {
  return {
    async syncGmailThreads(tenantId: string, userId: string) {
      const conn = await prisma.oAuthConnection.findFirst({
        where: { tenantId, userId, provider: 'google' },
      });
      if (!conn) return { synced: 0 };
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=50', {
        headers: { Authorization: `Bearer ${conn.accessToken}` },
      });
      if (!res.ok) return { synced: 0 };
      const body = (await res.json()) as { threads?: Array<{ id: string }> };
      return { synced: body.threads?.length ?? 0 };
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
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${conn.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      });
      if (!res.ok) throw new Error('Gmail send failed');
      return res.json();
    },
  };
}
