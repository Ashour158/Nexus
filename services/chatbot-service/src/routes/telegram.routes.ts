import type { FastifyInstance } from 'fastify';
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
    const body = request.body as TelegramWebhookBody;
    const text = body.message?.text;
    const chatId = body.message?.chat?.id;
    if (!text || !chatId) return reply.send({ status: 'ok' });

    const externalId = String(chatId);
    const tenantId = process.env.DEFAULT_TENANT_ID ?? 'default';
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
