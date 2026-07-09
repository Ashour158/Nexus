/**
 * SMS channel — sends text messages via the Twilio REST API using global
 * `fetch` (no SDK dependency). It is fully env-gated: when
 * `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` are not all set,
 * the channel becomes a guarded no-op that logs "SMS not configured" and
 * returns cleanly. It NEVER throws — a send failure is caught and logged so a
 * consumer is never blocked by SMS delivery.
 */

export interface SmsEnvelope {
  /** E.164 destination phone number, e.g. "+14155552671". */
  to: string;
  /** Message body. */
  body: string;
}

export interface SmsChannel {
  /** Whether Twilio is configured. When false, `send` is a logged no-op that never throws. */
  isConfigured(): boolean;
  send(envelope: SmsEnvelope): Promise<void>;
}

type Logger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export function createSmsChannel(log: Logger): SmsChannel {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM?.trim();

  if (!accountSid || !authToken || !from) {
    log.warn(
      'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM not configured — SMS not configured; SMS channel will skip sending.'
    );
    return {
      isConfigured: () => false,
      async send(envelope) {
        log.info(
          { to: envelope.to },
          '[sms-channel] skipped (SMS not configured)'
        );
      },
    };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    accountSid
  )}/Messages.json`;
  const authHeader =
    'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  return {
    isConfigured: () => true,
    async send(envelope) {
      if (!envelope.to?.trim()) {
        log.info('[sms-channel] skipped (no destination number)');
        return;
      }
      try {
        const params = new URLSearchParams({
          To: envelope.to,
          From: from,
          Body: envelope.body,
        });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        const res = (await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
          signal: controller.signal,
        }).finally(() => clearTimeout(timer))) as unknown as {
          ok: boolean;
          status: number;
          text: () => Promise<string>;
        };
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          log.error(
            { to: envelope.to, status: res.status, detail },
            'SMS send failed'
          );
          // NOT-05: propagate a real delivery failure so the consumer retries / DLQs.
          throw new Error(`SMS send failed with status ${res.status}`);
        }
        log.info({ to: envelope.to }, 'SMS sent');
      } catch (err) {
        // NOT-05: rethrow genuine send errors (network/abort/non-2xx). The
        // unconfigured no-op and the "no destination number" guard above return
        // early and never reach here, so neither is treated as a failure.
        log.error({ err, to: envelope.to }, 'SMS send failed');
        throw err;
      }
    },
  };
}
