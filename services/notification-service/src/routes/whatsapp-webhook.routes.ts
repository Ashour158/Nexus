import type { FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { TOPICS, type NexusProducer } from '@nexus/kafka';

/**
 * Inbound WhatsApp webhook (WhatsApp Cloud API / Meta).
 *
 * Mirrors the existing chatbot-service webhook contract:
 *   GET  /api/v1/webhooks/whatsapp   — Meta subscription verification handshake.
 *   POST /api/v1/webhooks/whatsapp   — inbound messages, HMAC-verified.
 *
 * `/api/v1/webhooks/*` is exempt from JWT verification by `createService`
 * (see packages/service-utils/src/server.ts); the POST is instead authenticated
 * by the Meta `x-hub-signature-256` HMAC over the raw request body.
 *
 * Every inbound text message is re-published as a `whatsapp.received` event on
 * the comms topic (`TOPICS.CALLS`) carrying `{ from, body, messageId, ... }` so
 * downstream (comm-service / timeline) can correlate it to a contact. The route
 * is fully guarded and fail-open: missing config or a malformed body responds
 * cleanly and never throws.
 */

interface WhatsAppWebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          id?: string;
          type: string;
          from: string;
          timestamp?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

function verifyWhatsAppSignature(
  appSecret: string,
  rawBody: Buffer,
  signatureHeader: string
): boolean {
  const expected = createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  const received = signatureHeader.replace('sha256=', '');
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

export async function registerWhatsAppWebhookRoutes(
  app: FastifyInstance,
  producer?: NexusProducer | null
): Promise<void> {
  // Meta subscription verification handshake.
  app.get('/api/v1/webhooks/whatsapp', async (request, reply) => {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    const q = request.query as Record<string, string>;
    if (verifyToken && q['hub.verify_token'] === verifyToken) {
      return reply.send(q['hub.challenge']);
    }
    return reply.code(403).send({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Invalid verify token' },
    });
  });

  app.post('/api/v1/webhooks/whatsapp', async (request, reply) => {
    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
    // Guarded / env-gated: if inbound WhatsApp isn't configured, accept and
    // no-op so Meta doesn't retry-storm, but do nothing.
    if (!appSecret) {
      app.log.warn(
        '[whatsapp-webhook] WHATSAPP_APP_SECRET not set — inbound WhatsApp disabled; ignoring payload'
      );
      return reply.send({ status: 'ignored' });
    }

    const signature = String(request.headers['x-hub-signature-256'] ?? '');
    const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
    if (
      !rawBody ||
      !signature ||
      !verifyWhatsAppSignature(appSecret, rawBody, signature)
    ) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Invalid webhook signature' },
      });
    }

    // Tenant resolution — required to key the event. No fabricated fallback.
    const tenantId = process.env.WHATSAPP_WEBHOOK_TENANT_ID?.trim();
    if (!tenantId) {
      app.log.warn(
        '[whatsapp-webhook] WHATSAPP_WEBHOOK_TENANT_ID not configured — cannot attribute inbound message; ignoring'
      );
      return reply.send({ status: 'ignored' });
    }

    const body = request.body as WhatsAppWebhookBody;
    const change = body?.entry?.[0]?.changes?.[0]?.value;
    const messages = change?.messages;
    if (!messages?.length) return reply.send({ status: 'ok' });

    const contactName = change?.contacts?.[0]?.profile?.name;

    for (const msg of messages) {
      if (msg.type !== 'text') continue;
      const from = msg.from;
      const text = msg.text?.body ?? '';

      // Best-effort emit; never throw out of the webhook (fail-open).
      if (producer?.isConnected()) {
        try {
          await producer.publish(TOPICS.CALLS, {
            type: 'whatsapp.received',
            tenantId,
            payload: {
              channel: 'WHATSAPP',
              direction: 'INBOUND',
              from,
              body: text,
              messageId: msg.id,
              contactName,
              phoneNumberId: change?.metadata?.phone_number_id,
              receivedAt: msg.timestamp
                ? new Date(Number(msg.timestamp) * 1000).toISOString()
                : new Date().toISOString(),
            },
          });
        } catch (err) {
          app.log.error(
            { err, from },
            '[whatsapp-webhook] failed to emit whatsapp.received'
          );
        }
      } else {
        app.log.warn(
          { from },
          '[whatsapp-webhook] Kafka producer unavailable — dropped inbound whatsapp.received'
        );
      }
    }

    return reply.send({ status: 'ok' });
  });
}
