import type { FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Prisma } from '../../../../node_modules/.prisma/chatbot-client/index.js';
import type { ChatbotPrisma } from '../prisma.js';
import { processMessage } from '../services/conversation.service.js';
import { sendWhatsAppMessage } from '../services/whatsapp.service.js';

interface WhatsAppWebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          type: string;
          from: string;
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
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const received = signatureHeader.replace('sha256=', '');
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export async function registerWhatsAppRoutes(app: FastifyInstance, prisma: ChatbotPrisma) {
  app.get('/api/v1/webhooks/whatsapp', async (request, reply) => {
    const q = request.query as Record<string, string>;
    if (q['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
      return reply.send(q['hub.challenge']);
    }
    return reply.code(403).send({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Invalid verify token', requestId: request.id },
    });
  });

  app.post('/api/v1/webhooks/whatsapp', async (request, reply) => {
    // 1. Verify Meta signature
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    const signature = String(request.headers['x-hub-signature-256'] ?? '');
    const rawBody = (request as any).rawBody as Buffer | undefined;

    if (!appSecret) {
      return reply.code(500).send({
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'WHATSAPP_APP_SECRET not set' },
      });
    }

    if (!rawBody || !signature || !verifyWhatsAppSignature(appSecret, rawBody, signature)) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Invalid webhook signature' },
      });
    }

    // 2. Resolve tenant (required — no fallback)
    const tenantId = process.env.WHATSAPP_WEBHOOK_TENANT_ID ?? '';
    if (!tenantId) {
      return reply.code(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'WHATSAPP_WEBHOOK_TENANT_ID not configured' },
      });
    }

    const body = request.body as WhatsAppWebhookBody;
    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!messages?.length) return reply.send({ status: 'ok' });

    for (const msg of messages) {
      if (msg.type !== 'text') continue;
      const from = msg.from;
      const text = msg.text?.body ?? '';

      let conv = await prisma.conversation.findUnique({
        where: {
          tenantId_channel_externalId: { tenantId, channel: 'WHATSAPP', externalId: from },
        },
      });
      if (!conv) {
        conv = await prisma.conversation.create({
          data: { tenantId, channel: 'WHATSAPP', externalId: from, state: 'IDLE' },
        });
      }

      await prisma.conversationMessage.create({
        data: { conversationId: conv.id, direction: 'INBOUND', body: text },
      });

      const result = await processMessage(conv, text, prisma);

      await prisma.conversation.update({
        where: { id: conv.id },
        data: {
          state: result.newState,
          context: (result.updatedContext ??
            (conv.context as Record<string, unknown>)) as Prisma.InputJsonValue,
          lastMessageAt: new Date(),
        },
      });

      await prisma.conversationMessage.create({
        data: { conversationId: conv.id, direction: 'OUTBOUND', body: result.reply },
      });

      await sendWhatsAppMessage(from, result.reply);
    }

    return reply.send({ status: 'ok' });
  });
}
