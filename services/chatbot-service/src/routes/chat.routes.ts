import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import type { NexusProducer } from '@nexus/kafka';
import type { Prisma } from '../../../../node_modules/.prisma/chatbot-client/index.js';
import type { ChatbotPrisma } from '../prisma.js';
import { processMessage } from '../services/conversation.service.js';
import {
  looksLikeEmail,
  resolveContactByEmail,
  emitLeadCaptured,
  emitChatTimeline,
} from '../services/chat.service.js';

/**
 * Web live-chat channel — the SalesIQ-lite backend for a website chat widget.
 *
 * A visitor opens a session (POST /chat/session), sends messages
 * (POST /chat/session/:id/message) which run through the existing rules-only
 * `processMessage` engine (intent routing + handoff, no AI), and polls the
 * transcript (GET /chat/session/:id). Sessions are Conversations on channel WEB,
 * scoped by tenant and guarded by a per-session token.
 *
 * Additive + fail-open throughout: CRM linkage and timeline events are
 * best-effort and never block the visitor's chat.
 */

interface StartSessionBody {
  /** Embed key / tenant identifier issued to the website. */
  tenantId?: string;
  embedKey?: string;
  name?: string;
  email?: string;
}

interface SendMessageBody {
  message?: string;
}

/** Resolve tenant from a configured embed-key map: "key1:tenantA,key2:tenantB". */
function tenantFromEmbedKey(embedKeys: string, key: string | undefined): string | null {
  const k = key?.trim();
  if (!k) return null;
  for (const pair of embedKeys.split(',')) {
    const [mapKey, tenant] = pair.split(':').map((s) => s.trim());
    if (mapKey && mapKey === k && tenant) return tenant;
  }
  return null;
}

/**
 * Result of resolving a tenant for a public session-start request.
 *  - ok: tenant trusted (verified embed key, or dev fallback)
 *  - reason 'missing': no tenantId/embedKey supplied at all (400)
 *  - reason 'embed_key_required': an embed-key map is configured and the caller
 *    presented no matching key — or none is configured but we refuse to trust a
 *    bare tenantId in production (403).
 */
type TenantResolution =
  | { ok: true; tenantId: string }
  | { ok: false; reason: 'missing' | 'embed_key_required' };

/**
 * Resolve the tenant for a public chat session.
 *
 * Security: a bare, caller-supplied `tenantId` is NOT trusted in production —
 * otherwise an anonymous visitor could open WEB conversations and emit
 * lead/timeline events under any tenant id they choose.
 *
 *  - If CHAT_EMBED_KEYS is configured, the tenant is derived ONLY from a valid
 *    embed key; requests without a matching key are rejected (bare tenantId is
 *    ignored). This is the intended production path.
 *  - If CHAT_EMBED_KEYS is NOT configured, a bare tenantId is honoured only in a
 *    non-production context (NODE_ENV !== 'production') or when the explicit dev
 *    flag CHAT_ALLOW_UNVERIFIED_TENANT=true is set. In production with no map,
 *    the request is rejected as 'embed_key_required'.
 */
function resolveTenant(body: StartSessionBody): TenantResolution {
  const embedKeys = (process.env.CHAT_EMBED_KEYS ?? '').trim();

  if (embedKeys) {
    // Embed-key map configured → trust only a verified key. A bare tenantId is
    // deliberately ignored here so it cannot bypass the mapping.
    const tenant = tenantFromEmbedKey(embedKeys, body.embedKey);
    if (tenant) return { ok: true, tenantId: tenant };
    return { ok: false, reason: 'embed_key_required' };
  }

  // No embed-key map configured — bare tenantId fallback for dev ergonomics.
  const bare = body.tenantId?.trim();
  if (bare) {
    const allowUnverified =
      process.env.NODE_ENV !== 'production' ||
      process.env.CHAT_ALLOW_UNVERIFIED_TENANT === 'true';
    if (allowUnverified) return { ok: true, tenantId: bare };
    // Production with no map: refuse to trust caller-supplied tenantId.
    return { ok: false, reason: 'embed_key_required' };
  }

  return { ok: false, reason: 'missing' };
}

/** Constant-time-ish token check; returns true only on exact match. */
function tokenMatches(expected: string | null, provided: string | undefined): boolean {
  if (!expected || !provided) return false;
  return expected === provided;
}

export async function registerChatRoutes(
  app: FastifyInstance,
  prisma: ChatbotPrisma,
  producer?: NexusProducer | null
) {
  // 1. Start a visitor session.
  app.post('/api/v1/chat/session', async (request, reply) => {
    const body = (request.body ?? {}) as StartSessionBody;
    const resolution = resolveTenant(body);
    if (!resolution.ok) {
      if (resolution.reason === 'embed_key_required') {
        return reply.code(403).send({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'a valid chat embed key is required',
            requestId: request.id,
          },
        });
      }
      return reply.code(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'tenantId or a valid embedKey is required', requestId: request.id },
      });
    }
    const tenantId = resolution.tenantId;

    const externalId = `web:${randomUUID()}`;
    const sessionToken = randomUUID();
    const email = body.email?.trim();
    const name = body.name?.trim();

    // Guarded contact resolution — fail-open.
    let contactId: string | null = null;
    if (looksLikeEmail(email)) {
      contactId = await resolveContactByEmail(tenantId, email!);
    }

    const conv = await prisma.conversation.create({
      data: {
        tenantId,
        channel: 'WEB',
        externalId,
        state: 'IDLE',
        sessionToken,
        visitorName: name || null,
        visitorEmail: email || null,
        contactId,
      },
    });

    // If the visitor shared details but isn't a known contact, capture a lead.
    if (!contactId && (looksLikeEmail(email) || name)) {
      await emitLeadCaptured(producer, {
        conversation: { id: conv.id, tenantId, channel: conv.channel },
        name,
        email,
      });
    }

    await emitChatTimeline(producer, {
      type: 'chat.session_started',
      conversation: conv,
      metadata: { visitorName: name, visitorEmail: email },
    });

    return reply.code(201).send({
      success: true,
      data: {
        sessionId: conv.id,
        sessionToken,
        tenantId,
        contactId,
        state: conv.state,
      },
    });
  });

  // 2. Visitor sends a message; runs the rules-based engine and returns the reply.
  app.post('/api/v1/chat/session/:id/message', async (request, reply) => {
    const { id } = request.params as { id: string };
    const token = String(request.headers['x-session-token'] ?? '');
    const body = (request.body ?? {}) as SendMessageBody;
    const text = (body.message ?? '').toString();

    if (!text.trim()) {
      return reply.code(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'message is required', requestId: request.id },
      });
    }

    const conv = await prisma.conversation.findFirst({ where: { id, channel: 'WEB' } });
    if (!conv || !tokenMatches(conv.sessionToken, token)) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found', requestId: request.id },
      });
    }

    await prisma.conversationMessage.create({
      data: { conversationId: conv.id, direction: 'INBOUND', body: text },
    });

    // Late contact/lead linkage: if the visitor typed an email mid-chat and we
    // haven't linked a contact yet, try to resolve it now (fail-open).
    let contactId = conv.contactId;
    if (!contactId && looksLikeEmail(text.trim())) {
      contactId = await resolveContactByEmail(conv.tenantId, text.trim());
      if (contactId) {
        await prisma.conversation.update({ where: { id: conv.id }, data: { contactId } });
      } else {
        await emitLeadCaptured(producer, {
          conversation: { id: conv.id, tenantId: conv.tenantId, channel: conv.channel },
          email: text.trim(),
        });
      }
    }

    const result = await processMessage(conv, text, prisma, producer);

    await prisma.conversation.update({
      where: { id: conv.id },
      data: {
        state: result.newState,
        context: (result.updatedContext ??
          (conv.context as Record<string, unknown>)) as Prisma.InputJsonValue,
        lastMessageAt: new Date(),
        ...(contactId && contactId !== conv.contactId ? { contactId } : {}),
      },
    });

    await prisma.conversationMessage.create({
      data: { conversationId: conv.id, direction: 'OUTBOUND', body: result.reply },
    });

    // Timeline: emit the message; emit handoff when this turn escalated.
    const convForTimeline = { ...conv, contactId };
    await emitChatTimeline(producer, {
      type: 'chat.message',
      conversation: convForTimeline,
      body: text,
    });
    if (result.handoff) {
      await emitChatTimeline(producer, {
        type: 'chat.handed_off',
        conversation: convForTimeline,
        body: text,
      });
    }

    return reply.send({
      success: true,
      data: {
        reply: result.reply,
        state: result.newState,
        handoff: Boolean(result.handoff),
      },
    });
  });

  // 3. Fetch the transcript (for the widget to poll).
  app.get('/api/v1/chat/session/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const token = String(request.headers['x-session-token'] ?? '');

    const conv = await prisma.conversation.findFirst({ where: { id, channel: 'WEB' } });
    if (!conv || !tokenMatches(conv.sessionToken, token)) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found', requestId: request.id },
      });
    }

    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({
      success: true,
      data: {
        sessionId: conv.id,
        state: conv.state,
        contactId: conv.contactId,
        handedOff: conv.state === 'HANDED_OFF',
        messages: messages.map((m) => ({
          direction: m.direction,
          body: m.body,
          createdAt: m.createdAt,
        })),
      },
    });
  });
}
