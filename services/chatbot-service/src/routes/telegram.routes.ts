import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'crypto';
import type { Prisma } from '../../../../node_modules/.prisma/chatbot-client/index.js';
import type { ChatbotPrisma } from '../prisma.js';
import { processMessage } from '../services/conversation.service.js';
import { sendTelegramMessage } from '../services/telegram.service.js';

interface TelegramWebhookBody {
  message?: {
    text?: string;
    chat?: { id?: number };
  };
}

export async function registerTelegramRoutes(app: FastifyInstance, prisma: ChatbotPrisma) {
  app.post('/api/v1/webhooks/telegram', async (request, reply) => {
    // 1. Verify secret token
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const receivedSecret = String(request.headers['x-telegram-bot-api-secret-token'] ?? '');
    if (!expectedSecret || !receivedSecret) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Webhook secret not configured' },
      });
    }
    const valid =
      expectedSecret.length === receivedSecret.length &&
      timingSafeEqual(Buffer.from(expectedSecret), Buffer.from(receivedSecret));
    if (!valid) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Invalid webhook secret' },
      });
    }

    // 2. Resolve tenant (required — no fallback)
    const tenantId = process.env.TELEGRAM_WEBHOOK_TENANT_ID ?? '';
    if (!tenantId) {
      return reply.code(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'TELEGRAM_WEBHOOK_TENANT_ID not configured' },
      });
    }

    const body = request.body as TelegramWebhookBody;
    const text = body.message?.text;
    const chatId = body.message?.chat?.id;
    if (!text || !chatId) return reply.send({ status: 'ok' });

    const externalId = String(chatId);
    let conv = await prisma.conversation.findUnique({
      where: {
        tenantId_channel_externalId: {
          tenantId,
          channel: 'TELEGRAM',
          externalId,
        },
      },
    });
    if (!conv) {
      conv = await prisma.conversation.create({
        data: { tenantId, channel: 'TELEGRAM', externalId, state: 'IDLE' },
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
    await sendTelegramMessage(externalId, result.reply);
    return reply.send({ status: 'ok' });
  });
}
