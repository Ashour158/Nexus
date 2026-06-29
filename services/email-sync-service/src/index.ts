import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService } from '@nexus/service-utils';
import { google } from 'googleapis';
import { registerGraphQL } from './graphql/index.js';
import { PrismaClient } from '../../../node_modules/.prisma/email-sync-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';

startTracing({ serviceName: 'email-sync-service' });
const port = parseInt(process.env.PORT ?? '3026', 10);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'email-sync-service',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
  publicPrefixes: ['/oauth/'],
});

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: buildDatabaseUrl({
        connectionLimit: 5,
        poolTimeout: 10,
        databaseUrl: process.env.EMAIL_SYNC_DATABASE_URL,
      }),
    },
  },
});

function getTenantId(req: any): string | null {
  const payload = (req as any).user as any;
  return payload?.tenantId ?? req.headers['x-tenant-id'] ?? null;
}

app.get('/health', async () => ({ status: 'ok', service: 'email-sync-service' }));

/* ── OAuth ─────────────────────────────────────────────────────────────────── */

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

app.get('/oauth/gmail/callback', async (req, reply) => {
  const { code, state: userId } = req.query as { code?: string; state?: string };
  if (!code || !userId) {
    return reply.redirect('/settings?tab=integrations&error=oauth_failed');
  }
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  try {
    const { tokens } = await oauth2Client.getToken(code);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.data.emailAddress ?? '';

    await prisma.emailConnection.upsert({
      where: { userId },
      update: {
        accessToken: tokens.access_token ?? '',
        refreshToken: tokens.refresh_token ?? undefined,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        email,
        provider: 'gmail',
      },
      create: {
        tenantId: 'default', // TODO: propagate tenant from OAuth state securely
        userId,
        provider: 'gmail',
        email,
        accessToken: tokens.access_token ?? '',
        refreshToken: tokens.refresh_token ?? undefined,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      },
    });
    return reply.redirect('/settings?tab=integrations&connected=gmail');
  } catch (err: any) {
    app.log.error({ err: err.message }, 'Gmail OAuth callback failed');
    return reply.redirect('/settings?tab=integrations&error=oauth_failed');
  }
});

/* ── Connection ────────────────────────────────────────────────────────────── */

app.get('/connection/:userId', async (req) => {
  const { userId } = req.params as { userId: string };
  const conn = await prisma.emailConnection.findUnique({ where: { userId } });
  if (!conn) {
    return { connected: false, provider: null, userId };
  }
  return {
    connected: true,
    provider: conn.provider,
    email: conn.email,
    userId,
    lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
  };
});

app.delete('/connection/:userId', async (req) => {
  const { userId } = req.params as { userId: string };
  await prisma.emailConnection.deleteMany({ where: { userId } });
  return { success: true };
});

/* ── Inbox / Threads (real DB data — empty until sync is implemented) ──────── */

app.get('/inbox/:userId', async (req, reply) => {
  const { userId } = req.params as { userId: string };
  const q = (req.query as { q?: string; dealId?: string }).q ?? '';
  const dealId = (req.query as { q?: string; dealId?: string }).dealId;
  const tenantId = getTenantId(req);

  const conn = await prisma.emailConnection.findUnique({ where: { userId } });
  if (!conn) {
    return reply.code(404).send({ success: false, error: { code: 'NOT_CONNECTED', message: 'No email connection found. Connect Gmail first.' } });
  }

  const messages = await prisma.emailMessage.findMany({
    where: {
      userId,
      ...(tenantId ? { tenantId } : {}),
      ...(dealId ? { dealId } : {}),
      ...(q ? { OR: [{ subject: { contains: q, mode: 'insensitive' } }, { from: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { sentAt: 'desc' },
    take: 100,
  });

  // Group by threadId for thread list view
  const threadMap = new Map<string, typeof messages[0][]>();
  for (const m of messages) {
    const list = threadMap.get(m.threadId) ?? [];
    list.push(m);
    threadMap.set(m.threadId, list);
  }

  const threads = Array.from(threadMap.entries()).map(([threadId, msgs]) => ({
    id: threadId,
    subject: msgs[0].subject,
    from: msgs[0].from,
    snippet: msgs[0].snippet,
    sentAt: msgs[0].sentAt.toISOString(),
    isRead: msgs.every((m) => m.isRead),
    messageCount: msgs.length,
    dealId: msgs[0].dealId,
    contactId: msgs[0].contactId,
    userId,
  }));

  return threads;
});

app.get('/threads/:userId/:threadId', async (req, reply) => {
  const { userId, threadId } = req.params as { userId: string; threadId: string };
  const tenantId = getTenantId(req);

  const conn = await prisma.emailConnection.findUnique({ where: { userId } });
  if (!conn) {
    return reply.code(404).send({ success: false, error: { code: 'NOT_CONNECTED', message: 'No email connection found.' } });
  }

  const messages = await prisma.emailMessage.findMany({
    where: { userId, threadId, ...(tenantId ? { tenantId } : {}) },
    orderBy: { sentAt: 'asc' },
  });

  return messages.map((m: any) => ({
    id: m.id,
    from: m.from,
    to: m.to,
    body: m.body,
    sentAt: m.sentAt.toISOString(),
    isInbound: m.isInbound,
  }));
});

/* ── Send / Sync (honestly not yet implemented) ────────────────────────────── */

app.post('/send/:userId', async (req, reply) => {
  const { userId } = req.params as { userId: string };
  const conn = await prisma.emailConnection.findUnique({ where: { userId } });
  if (!conn) {
    return reply.code(404).send({ success: false, error: { code: 'NOT_CONNECTED', message: 'No email connection found.' } });
  }
  return reply.code(503).send({
    success: false,
    error: { code: 'NOT_IMPLEMENTED', message: 'Email sending is not yet implemented.' },
  });
});

app.post('/sync/:userId', async (req, reply) => {
  const { userId } = req.params as { userId: string };
  const conn = await prisma.emailConnection.findUnique({ where: { userId } });
  if (!conn) {
    return reply.code(404).send({ success: false, error: { code: 'NOT_CONNECTED', message: 'No email connection found.' } });
  }
  // TODO: Implement Gmail API sync loop to populate EmailMessage table
  return reply.code(503).send({
    success: false,
    error: { code: 'NOT_IMPLEMENTED', message: 'Email sync is not yet implemented.' },
  });
});

app.addHook('onClose', async () => {
  await prisma.$disconnect();
  app.log.info('email-sync-service shutdown complete');
});

await registerGraphQL(app, prisma);

await startService(app, port, async () => {});
