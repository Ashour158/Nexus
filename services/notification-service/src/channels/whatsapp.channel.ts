/**
 * WhatsApp channel — sends WhatsApp messages via global `fetch` (no SDK
 * dependency), mirroring the SMS (Twilio) and push (FCM) channels.
 *
 * Two providers are supported, auto-selected from the environment:
 *
 *  1. Twilio WhatsApp API — reuses the existing Twilio credentials
 *     (`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`) plus `TWILIO_WHATSAPP_FROM`
 *     (an E.164 number the Twilio account has WhatsApp-enabled, e.g.
 *     "+14155238886"). Selected when `TWILIO_WHATSAPP_FROM` is set. Freeform
 *     text only (Twilio content-templates are out of scope here).
 *
 *  2. WhatsApp Cloud API (Meta) — `WHATSAPP_PHONE_ID` + `WHATSAPP_ACCESS_TOKEN`
 *     (matching chatbot-service / comm-service conventions). Supports both
 *     freeform text and named templates. Selected when the Twilio WhatsApp
 *     number is not configured but the Cloud API vars are.
 *
 * The channel is fully env-gated: when neither provider is configured it becomes
 * a guarded no-op that logs "WhatsApp not configured" and returns cleanly. It
 * NEVER throws — a send failure is caught and logged so a consumer is never
 * blocked by WhatsApp delivery.
 */

export interface WhatsAppTemplate {
  /** Registered template name (WhatsApp Cloud API only). */
  name: string;
  /** BCP-47 language code, e.g. "en_US". Defaults to "en_US". */
  languageCode?: string;
  /** Ordered body-parameter text values, mapped to {{1}}, {{2}}, … */
  bodyParams?: string[];
}

export interface WhatsAppEnvelope {
  /** Destination phone in E.164 (without the "whatsapp:" prefix), e.g. "+14155552671". */
  to: string;
  /** Freeform message body. Used when `template` is not supplied. */
  body?: string;
  /**
   * Optional template send (WhatsApp Cloud API only). When set and the active
   * provider supports it, a template message is sent instead of freeform text.
   * With the Twilio provider, templates are ignored and `body` is used.
   */
  template?: WhatsAppTemplate;
}

export interface WhatsAppChannel {
  /** Whether a provider is configured. When false, `send` is a no-op. */
  isConfigured(): boolean;
  send(envelope: WhatsAppEnvelope): Promise<void>;
}

type Logger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

const SEND_TIMEOUT_MS = 10_000;

type FetchResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

/** Normalise a destination to the `whatsapp:+E164` form Twilio expects. */
function toTwilioAddress(to: string): string {
  const trimmed = to.trim();
  return trimmed.startsWith('whatsapp:') ? trimmed : `whatsapp:${trimmed}`;
}

/** Strip any leading `whatsapp:` prefix — the Cloud API wants a bare number. */
function toCloudAddress(to: string): string {
  return to.trim().replace(/^whatsapp:/, '');
}

async function timedFetch(
  url: string,
  init: Parameters<typeof fetch>[1]
): Promise<FetchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  return (await fetch(url, {
    ...init,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer))) as unknown as FetchResponse;
}

export function createWhatsAppChannel(log: Logger): WhatsAppChannel {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const twilioFrom = process.env.TWILIO_WHATSAPP_FROM?.trim();

  const cloudPhoneId = process.env.WHATSAPP_PHONE_ID?.trim();
  const cloudToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const cloudApiVersion = process.env.WHATSAPP_API_VERSION?.trim() || 'v20.0';

  const twilioReady = Boolean(accountSid && authToken && twilioFrom);
  const cloudReady = Boolean(cloudPhoneId && cloudToken);

  // Prefer Twilio when its WhatsApp number is set (reuses existing creds);
  // otherwise fall back to the WhatsApp Cloud API.
  const provider: 'twilio' | 'cloud' | 'none' = twilioReady
    ? 'twilio'
    : cloudReady
      ? 'cloud'
      : 'none';

  if (provider === 'none') {
    log.warn(
      'TWILIO_WHATSAPP_FROM (+ Twilio creds) or WHATSAPP_PHONE_ID/WHATSAPP_ACCESS_TOKEN not configured — WhatsApp not configured; WhatsApp channel will skip sending.'
    );
    return {
      isConfigured() {
        return false;
      },
      async send(envelope) {
        log.info(
          { to: envelope.to },
          '[whatsapp-channel] skipped (WhatsApp not configured)'
        );
      },
    };
  }

  if (provider === 'twilio') {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      accountSid as string
    )}/Messages.json`;
    const authHeader =
      'Basic ' +
      Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    return {
      isConfigured() {
        return true;
      },
      async send(envelope) {
        if (!envelope.to?.trim()) {
          log.info('[whatsapp-channel] skipped (no destination number)');
          return;
        }
        // Twilio path: freeform text only. If only a template was supplied,
        // fall back to its body params joined, so the message is never empty.
        const body =
          envelope.body ??
          envelope.template?.bodyParams?.join(' ') ??
          '';
        if (!body.trim()) {
          log.info('[whatsapp-channel] skipped (empty body)');
          return;
        }
        try {
          const params = new URLSearchParams({
            To: toTwilioAddress(envelope.to),
            From: toTwilioAddress(twilioFrom as string),
            Body: body,
          });
          const res = await timedFetch(url, {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          });
          if (!res.ok) {
            const detail = await res.text().catch(() => '');
            log.error(
              { to: envelope.to, status: res.status, detail },
              'WhatsApp send failed'
            );
            return;
          }
          log.info({ to: envelope.to, provider: 'twilio' }, 'WhatsApp sent');
        } catch (err) {
          log.error({ err, to: envelope.to }, 'WhatsApp send failed');
        }
      },
    };
  }

  // WhatsApp Cloud API (Meta Graph).
  const url = `https://graph.facebook.com/${cloudApiVersion}/${encodeURIComponent(
    cloudPhoneId as string
  )}/messages`;

  return {
    isConfigured() {
      return true;
    },
    async send(envelope) {
      if (!envelope.to?.trim()) {
        log.info('[whatsapp-channel] skipped (no destination number)');
        return;
      }
      const to = toCloudAddress(envelope.to);
      let payload: Record<string, unknown>;
      if (envelope.template?.name) {
        const t = envelope.template;
        payload = {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: t.name,
            language: { code: t.languageCode ?? 'en_US' },
            ...(t.bodyParams?.length
              ? {
                  components: [
                    {
                      type: 'body',
                      parameters: t.bodyParams.map((text) => ({
                        type: 'text',
                        text,
                      })),
                    },
                  ],
                }
              : {}),
          },
        };
      } else {
        const body = envelope.body ?? '';
        if (!body.trim()) {
          log.info('[whatsapp-channel] skipped (empty body)');
          return;
        }
        payload = {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body },
        };
      }
      try {
        const res = await timedFetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cloudToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          log.error(
            { to: envelope.to, status: res.status, detail },
            'WhatsApp send failed'
          );
          return;
        }
        log.info({ to: envelope.to, provider: 'cloud' }, 'WhatsApp sent');
      } catch (err) {
        log.error({ err, to: envelope.to }, 'WhatsApp send failed');
      }
    },
  };
}
