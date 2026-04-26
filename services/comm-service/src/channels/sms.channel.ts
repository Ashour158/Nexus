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

  return {
    async send(envelope) {
      const body = new URLSearchParams({
        To: envelope.to,
        From: from,
        Body: envelope.body,
      });
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        }
      );
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Twilio send failed: ${res.status} ${t}`);
      }
    },
  };
}
