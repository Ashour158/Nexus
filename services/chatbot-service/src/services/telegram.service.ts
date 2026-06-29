import { createHttpClient } from '@nexus/service-utils';

const client = createHttpClient({
  baseURL: `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`,
  timeoutMs: 10000,
  maxRetries: 3,
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
});

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  await client.post('/sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
  });
}
