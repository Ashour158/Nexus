import type { FastifyInstance } from 'fastify';
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

export async function registerWhatsAppRoutes(app: FastifyInstance, prisma: ChatbotPrisma) {
  app.get('/api/v1/webhooks/whatsapp', async (request, reply) => {
    const q = request.query as Record<string, string>;
    if (q['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
      return reply.send(q['hub.challenge']);
    }
    return reply.code(403).send();
  });

  app.post('/api/v1/webhooks/whatsapp', async (request, reply) => {
    const body = request.body as WhatsAppWebhookBody;
    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!messages?.length) return reply.send({ status: 'ok' });

    for (const msg of messages) {
      if (msg.type !== 'text') continue;
      const from = msg.from;
      const text = msg.text?.body ?? '';
      const tenantId = process.env.DEFAULT_TENANT_ID ?? 'default';

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
