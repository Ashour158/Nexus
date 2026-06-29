import { createHttpClient } from '@nexus/service-utils';

export interface SmsEnvelope {
  to: string;
  body: string;
}

export interface SmsChannel {
  send(envelope: SmsEnvelope): Promise<void>;
}

function twilioBasicAuth(): string | null {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) return null;
  return Buffer.from(`${sid}:${token}`).toString('base64');
}

export function createSmsChannel(log: {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}): SmsChannel {
  const auth = twilioBasicAuth();
  const from = process.env.TWILIO_FROM?.trim();

  if (!auth || !from) {
    log.warn('Twilio env not configured — SMS channel is skipped (dev mode).');
    return {
      async send(envelope) {
        log.info({ to: envelope.to }, '[sms] skipped (no Twilio)');
      },
    };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!.trim();

  const client = createHttpClient({
    baseURL: `https://api.twilio.com/2010-04-01/Accounts/${sid}`,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    timeoutMs: 10_000,
    maxRetries: 3,
    circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
  });

  return {
    async send(envelope) {
      const body = new URLSearchParams({
        To: envelope.to,
        From: from,
        Body: envelope.body,
      });
      await client.post('/Messages.json', body.toString());
    },
  };
}
