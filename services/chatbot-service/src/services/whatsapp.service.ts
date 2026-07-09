import { createHttpClient } from '@nexus/service-utils';

const client = createHttpClient({
  baseURL: `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}`,
  headers: {
    Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
  },
  timeoutMs: 10000,
  maxRetries: 3,
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
});

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  await client.post('/messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  });
}
