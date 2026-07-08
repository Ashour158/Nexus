import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import { createService, startService, registerHealthRoutes, checkDatabase } from '@nexus/service-utils';
import { google } from 'googleapis';
import { registerGraphQL } from './graphql/index.js';
import { PrismaClient } from '../../../node_modules/.prisma/email-sync-client/index.js';
import { buildDatabaseUrl } from '@nexus/service-utils/db';
import { NexusProducer } from '@nexus/kafka';
import { enrichMessage, extractEmailAddress } from './lib/enrich.js';
import { createFieldCrypto } from './lib/crypto.js';

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

registerHealthRoutes(app, 'email-sync-service', [() => checkDatabase(prisma)]);

/* ── OAuth token encryption ──────────────────────────────────────────────────
 * Encrypt Gmail access/refresh tokens at rest (AES-256-GCM), reusing the same
 * platform master key + mechanism as integration-service. Gated: if no valid
 * 32-byte key is configured, encryption is disabled (tokens stored as-is) so
 * the service still boots. Reads are decrypt-through — existing plaintext rows
 * pass straight through, so this is fully backward-compatible.
 */
const encKey = process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.INTEGRATION_SECRET_KEY;
let fieldCrypto: ReturnType<typeof createFieldCrypto> | null = null;
if (encKey && encKey.length >= 32) {
  try {
    fieldCrypto = createFieldCrypto(encKey);
    app.log.info('OAuth token encryption enabled (AES-256-GCM)');
  } catch (err: any) {
    app.log.warn({ err: err?.message }, 'OAuth token encryption disabled: INTEGRATION_ENCRYPTION_KEY must be exactly 32 bytes');
  }
} else {
  app.log.warn('OAuth token encryption disabled: set INTEGRATION_ENCRYPTION_KEY (>=32 chars) to encrypt Gmail tokens at rest');
}

function encToken(v: string | null | undefined): string | null | undefined {
  if (!v || !fieldCrypto) return v;
  return fieldCrypto.encrypt(v);
}

function decToken(v: string | null | undefined): string | null | undefined {
  if (!v || !fieldCrypto) return v;
  // Back-compat: existing plaintext rows are not valid ciphertext → return as-is.
  try {
    return fieldCrypto.decrypt(v);
  } catch {
    return v;
  }
}

// Kafka producer for emitting timeline/comm events. Fail-open: if the broker is
// unavailable the connect is best-effort and enrichment simply skips emission.
const producer = new NexusProducer('email-sync-service');
await producer.connect().catch((err: any) => app.log.warn({ err: err?.message }, 'kafka producer connect failed'));

function getTenantId(req: any): string | null {
  const payload = (req as any).user as any;
  return payload?.tenantId ?? req.headers['x-tenant-id'] ?? null;
}

/* ── OAuth ─────────────────────────────────────────────────────────────────── */

app.get('/oauth/gmail/init', async (req, reply) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  const q = req.query as { userId?: string; tenantId?: string };
  const userId = q.userId ?? '';
  const tenantId = q.tenantId ?? getTenantId(req) ?? 'default';
  const state = Buffer.from(JSON.stringify({ userId, tenantId })).toString('base64url');
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
    ],
    state,
  });
  return reply.send({ url });
});

app.get('/oauth/gmail/callback', async (req, reply) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) {
    return reply.redirect('/settings?tab=integrations&error=oauth_failed');
  }
  let userId: string;
  let tenantId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8')) as { userId: string; tenantId: string };
    userId = decoded.userId;
    tenantId = decoded.tenantId;
  } catch {
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
        accessToken: encToken(tokens.access_token ?? '') ?? '',
        refreshToken: tokens.refresh_token ? encToken(tokens.refresh_token) : undefined,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        email,
        provider: 'gmail',
      },
      create: {
        tenantId,
        userId,
        provider: 'gmail',
        email,
        accessToken: encToken(tokens.access_token ?? '') ?? '',
        refreshToken: tokens.refresh_token ? encToken(tokens.refresh_token) : undefined,
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

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function buildOauth2Client(conn: { accessToken: string; refreshToken?: string | null; tokenExpiry?: Date | null }) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  client.setCredentials({
    access_token: decToken(conn.accessToken) ?? undefined,
    refresh_token: conn.refreshToken ? decToken(conn.refreshToken) ?? undefined : undefined,
    expiry_date: conn.tokenExpiry?.getTime() ?? undefined,
  });
  return client;
}

function buildRawMessage(opts: { from: string; to: string; subject: string; body: string; replyToMessageId?: string }) {
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  if (opts.replyToMessageId) lines.push(`In-Reply-To: ${opts.replyToMessageId}`, `References: ${opts.replyToMessageId}`);
  lines.push('', opts.body);
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

/* ── Send ───────────────────────────────────────────────────────────────────── */

app.post('/send/:userId', async (req, reply) => {
  const { userId } = req.params as { userId: string };
  const conn = await prisma.emailConnection.findUnique({ where: { userId } });
  if (!conn) {
    return reply.code(404).send({ success: false, error: { code: 'NOT_CONNECTED', message: 'No email connection found.' } });
  }

  const { to, subject, body: emailBody, replyToMessageId, dealId, contactId } =
    req.body as { to: string; subject: string; body: string; replyToMessageId?: string; dealId?: string; contactId?: string };

  if (!to || !subject || !emailBody) {
    return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'to, subject, and body are required.' } });
  }

  try {
    const auth = buildOauth2Client(conn);
    const gmail = google.gmail({ version: 'v1', auth });
    const raw = buildRawMessage({ from: conn.email, to, subject, body: emailBody, replyToMessageId });
    const sent = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });

    const msgId = sent.data.id ?? `sent-${Date.now()}`;
    await prisma.emailMessage.upsert({
      where: { messageId: msgId },
      update: {},
      create: {
        tenantId: conn.tenantId,
        userId,
        provider: conn.provider,
        messageId: msgId,
        threadId: sent.data.threadId ?? msgId,
        subject,
        from: conn.email,
        to,
        snippet: emailBody.slice(0, 100),
        body: emailBody,
        isRead: true,
        isInbound: false,
        sentAt: new Date(),
        dealId: dealId ?? null,
        contactId: contactId ?? null,
      },
    });

    return reply.send({ success: true, data: { messageId: msgId, threadId: sent.data.threadId } });
  } catch (err: any) {
    app.log.error({ err: err.message }, 'Gmail send failed');
    return reply.code(502).send({ success: false, error: { code: 'SEND_FAILED', message: err.message } });
  }
});

/* ── Sync ───────────────────────────────────────────────────────────────────── */

type Conn = NonNullable<Awaited<ReturnType<typeof prisma.emailConnection.findUnique>>>;

/**
 * Pull recent Gmail messages for one connection, persist any new ones (with
 * their RFC 5322 correlation headers) and enrich each: correlate the thread,
 * resolve sender/recipient → contact/deal, and emit a timeline event.
 * Fully guarded — per-message failures are logged and skipped, never thrown.
 */
async function syncUser(conn: Conn): Promise<{ synced: number; total: number }> {
  const userId = conn.userId;
  const auth = buildOauth2Client(conn);
  const gmail = google.gmail({ version: 'v1', auth });
  const maxResults = 50;

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: conn.lastSyncAt ? `after:${Math.floor(conn.lastSyncAt.getTime() / 1000)}` : undefined,
  });

  const messages = listRes.data.messages ?? [];
  let synced = 0;

  for (const { id: msgId } of messages) {
    if (!msgId) continue;
    try {
      const existing = await prisma.emailMessage.findUnique({ where: { messageId: msgId } });
      if (existing) continue;

      const msg = await gmail.users.messages.get({ userId: 'me', id: msgId, format: 'full' });
      const headers: Record<string, string> = {};
      for (const h of msg.data.payload?.headers ?? []) {
        if (h.name) headers[h.name.toLowerCase()] = h.value ?? '';
      }

      let bodyText = '';
      const parts = msg.data.payload?.parts ?? [];
      const textPart = parts.find((p) => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        bodyText = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      } else if (msg.data.payload?.body?.data) {
        bodyText = Buffer.from(msg.data.payload.body.data, 'base64').toString('utf-8');
      }

      const from = headers['from'] ?? '';
      const to = headers['to'] ?? '';
      const subject = headers['subject'] ?? '(no subject)';
      const dateStr = headers['date'];
      const sentAt = dateStr ? new Date(dateStr) : new Date();
      const rfcMessageId = headers['message-id'] ?? null;
      const inReplyTo = headers['in-reply-to'] ?? null;
      const references = headers['references'] ?? null;
      const isInbound = !from.includes(conn.email);

      const created = await prisma.emailMessage.create({
        data: {
          tenantId: conn.tenantId,
          userId,
          provider: conn.provider,
          messageId: msgId,
          threadId: msg.data.threadId ?? msgId,
          subject,
          from,
          to,
          snippet: msg.data.snippet ?? bodyText.slice(0, 100),
          body: bodyText,
          isRead: !(msg.data.labelIds?.includes('UNREAD') ?? true),
          isInbound,
          sentAt,
          rfcMessageId: rfcMessageId ? rfcMessageId.trim().replace(/^<|>$/g, '') : null,
          inReplyTo: inReplyTo ? inReplyTo.trim().replace(/^<|>$/g, '') : null,
        },
      });
      synced++;

      // Enrich (correlate thread + resolve contact/deal + emit event). Fail-open.
      // Resolve the counterparty: for inbound that's the sender, for outbound the recipient.
      const counterpartyEmail = isInbound ? extractEmailAddress(from) : extractEmailAddress(to);
      await enrichMessage({
        prisma: prisma as any,
        producer,
        log: app.log,
        message: {
          id: created.id,
          tenantId: conn.tenantId,
          from,
          to,
          threadId: created.threadId,
          isInbound,
          contactId: created.contactId,
          dealId: created.dealId,
        },
        headers: { rfcMessageId, inReplyTo, references },
        counterpartyEmail,
        subject,
        sentAt,
      }).catch((err: any) => app.log.warn({ err: err?.message, msgId }, 'enrich failed'));
    } catch (err: any) {
      app.log.warn({ err: err?.message, msgId }, 'sync: message failed, skipping');
    }
  }

  await prisma.emailConnection.update({ where: { userId }, data: { lastSyncAt: new Date() } });
  return { synced, total: messages.length };
}

app.post('/sync/:userId', async (req, reply) => {
  const { userId } = req.params as { userId: string };
  const conn = await prisma.emailConnection.findUnique({ where: { userId } });
  if (!conn) {
    return reply.code(404).send({ success: false, error: { code: 'NOT_CONNECTED', message: 'No email connection found.' } });
  }

  try {
    const { synced, total } = await syncUser(conn);
    return reply.send({ success: true, data: { synced, total } });
  } catch (err: any) {
    app.log.error({ err: err.message }, 'Gmail sync failed');
    return reply.code(502).send({ success: false, error: { code: 'SYNC_FAILED', message: err.message } });
  }
});

/* ── Background poller ─────────────────────────────────────────────────────────
 * Optional: periodically sync all enabled connections so inbound replies are
 * ingested + enriched without a manual /sync call. Disabled unless
 * EMAIL_SYNC_POLL_INTERVAL_MS is set. Reentrancy-guarded and unref'd so it never
 * blocks shutdown and never overlaps runs.
 */
const pollIntervalMs = parseInt(process.env.EMAIL_SYNC_POLL_INTERVAL_MS ?? '0', 10);
let pollRunning = false;
if (pollIntervalMs > 0) {
  const timer = setInterval(async () => {
    if (pollRunning) return;
    pollRunning = true;
    try {
      const conns = await prisma.emailConnection.findMany({ where: { syncEnabled: true }, take: 500 });
      for (const c of conns) {
        try {
          await syncUser(c);
        } catch (err: any) {
          app.log.warn({ err: err?.message, userId: c.userId }, 'poller: syncUser failed');
        }
      }
    } catch (err: any) {
      app.log.warn({ err: err?.message }, 'poller: iteration failed');
    } finally {
      pollRunning = false;
    }
  }, pollIntervalMs);
  timer.unref();
  app.log.info({ pollIntervalMs }, 'email-sync poller enabled');
}

app.addHook('onClose', async () => {
  try { await producer.disconnect(); } catch { /* ignore */ }
  await prisma.$disconnect();
  app.log.info('email-sync-service shutdown complete');
});

await registerGraphQL(app, prisma);

await startService(app, port, async () => {});
