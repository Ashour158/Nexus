import type { FastifyBaseLogger } from 'fastify';
import { createHttpClient } from '@nexus/service-utils';

export type WhatsAppMessage = {
  to: string;
  type: 'text' | 'template' | 'document' | 'image';
  text?: string;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: unknown[];
  documentUrl?: string;
  documentName?: string;
  imageUrl?: string;
  caption?: string;
};

export type WhatsAppChannel = {
  sendMessage(msg: WhatsAppMessage): Promise<{ messageId: string }>;
  isConfigured(): boolean;
};

export function createWhatsAppChannel(log: FastifyBaseLogger): WhatsAppChannel {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION ?? 'v19.0';
  const client = createHttpClient({
    baseURL: `https://graph.facebook.com/${apiVersion}/${phoneNumberId}`,
    headers: {
      Authorization: `Bearer ${token ?? ''}`,
      'Content-Type': 'application/json',
    },
    timeoutMs: 10_000,
    maxRetries: 3,
    circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
  });

  return {
    isConfigured(): boolean {
      return Boolean(token && phoneNumberId);
    },

    async sendMessage(msg: WhatsAppMessage): Promise<{ messageId: string }> {
      if (!token || !phoneNumberId) {
        throw new Error(
          'WhatsApp Business API not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.'
        );
      }

      let payload: Record<string, unknown>;

      switch (msg.type) {
        case 'text':
          payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: msg.to,
            type: 'text',
            text: { preview_url: false, body: msg.text ?? '' },
          };
          break;

        case 'template':
          payload = {
            messaging_product: 'whatsapp',
            to: msg.to,
            type: 'template',
            template: {
              name: msg.templateName,
              language: { code: msg.templateLanguage ?? 'en_US' },
              components: msg.templateComponents ?? [],
            },
          };
          break;

        case 'document':
          payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: msg.to,
            type: 'document',
            document: {
              link: msg.documentUrl,
              filename: msg.documentName ?? 'document.pdf',
              caption: msg.caption,
            },
          };
          break;

        case 'image':
          payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: msg.to,
            type: 'image',
            image: { link: msg.imageUrl, caption: msg.caption },
          };
          break;

        default:
          throw new Error(`Unsupported WhatsApp message type: ${(msg as WhatsAppMessage).type}`);
      }

      const result = await client.post<{ messages?: Array<{ id: string }> }>('/messages', payload);
      const messageId = result.messages?.[0]?.id ?? 'unknown';
      log.info({ to: msg.to, messageId }, 'WhatsApp message sent');
      return { messageId };
    },
  };
}
