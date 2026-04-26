import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { globalErrorHandler, startService } from '@nexus/service-utils';
import { google } from 'googleapis';

const app = Fastify({ logger: true });

await app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET ?? 'nexus-development-secret-at-least-32',
});
await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
});
app.setErrorHandler(globalErrorHandler);

app.get('/health', async () => ({ status: 'ok', service: 'email-sync-service' }));

app.get('/oauth/gmail/init', async (req, reply) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  const userId = (req.query as { userId?: string }).userId ?? '';
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
    ],
    state: userId,
  });
  return reply.send({ url });
});

app.get('/oauth/gmail/callback', async (_req, reply) => {
  return reply.redirect('/settings?tab=integrations&connected=gmail');
});

app.get('/connection/:userId', async (req) => {
  const userId = (req.params as { userId: string }).userId;
  return { connected: false, provider: null, userId };
});

app.delete('/connection/:userId', async () => ({ success: true }));

app.get('/inbox/:userId', async (req) => {
  const { userId } = req.params as { userId: string };
  const q = (req.query as { q?: string; dealId?: string }).q ?? '';
  const dealId = (req.query as { q?: string; dealId?: string }).dealId;
  const demo = [
    {
      id: 'thread-demo-1',
      subject: 'Pricing confirmation',
      from: 'Jordan Lee <jordan@example.com>',
      snippet: 'Can you confirm annual billing and implementation timeline?',
      sentAt: new Date().toISOString(),
      isRead: false,
      messageCount: 2,
      dealId: dealId ?? null,
      contactId: 'contact-demo-1',
      userId,
    },
  ];
  const filtered = q
    ? demo.filter((t) => t.subject.toLowerCase().includes(q.toLowerCase()) || t.from.toLowerCase().includes(q.toLowerCase()))
    : demo;
  return filtered;
});

app.get('/threads/:userId/:threadId', async (req) => {
  const { threadId } = req.params as { userId: string; threadId: string };
  return [
    {
      id: `${threadId}-1`,
      from: 'Jordan Lee <jordan@example.com>',
      to: 'you@nexus.app',
      body: 'Hi team, can we align on pricing?',
      sentAt: new Date(Date.now() - 3600_000).toISOString(),
      isInbound: true,
    },
    {
      id: `${threadId}-2`,
      from: 'you@nexus.app',
      to: 'Jordan Lee <jordan@example.com>',
      body: 'Absolutely, sharing final pricing today.',
      sentAt: new Date().toISOString(),
      isInbound: false,
    },
  ];
});

app.post('/send/:userId', async (req) => {
  const { userId } = req.params as { userId: string };
  const payload = req.body as Record<string, unknown>;
  return { success: true, userId, messageId: `sent-${Date.now()}`, ...payload };
});

app.post('/sync/:userId', async (req) => {
  const { userId } = req.params as { userId: string };
  return { success: true, userId, syncedAt: new Date().toISOString() };
});

const port = parseInt(process.env.PORT ?? '3026', 10);
await startService(app, port, async () => {
  app.log.info('email-sync-service shutdown complete');
});
