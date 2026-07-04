import type { FastifyBaseLogger } from 'fastify';
import crypto from 'node:crypto';

/**
 * CTI telephony channel — provider-agnostic click-to-call over Twilio Voice.
 *
 * Additive, env-gated, fail-open. Uses the global `fetch` (no new deps) and
 * `node:crypto` for provider webhook signature verification. When Twilio env
 * is unset the channel reports `isConfigured() === false` and `initiateCall`
 * returns a clear "not configured" result instead of throwing, so the feature
 * is inert on environments that have not opted in.
 *
 * Config (all read from process.env):
 *   TWILIO_ACCOUNT_SID   — Twilio account SID (ACxx…)
 *   TWILIO_AUTH_TOKEN    — Twilio auth token (also used for webhook signature verification)
 *   TWILIO_CALLER_ID     — the outbound caller id / from number (E.164, a Twilio number)
 *   TELEPHONY_STATUS_CALLBACK_URL — public URL Twilio posts call status to (optional)
 *   TELEPHONY_TWIML_URL  — TwiML the call executes once answered (optional; a safe default is used)
 */

export type CallDirection = 'OUTBOUND' | 'INBOUND';

export interface InitiateCallInput {
  tenantId: string;
  agentUserId: string;
  toNumber: string;
  entityType?: string;
  entityId?: string;
}

export type InitiateCallResult =
  | {
      ok: true;
      provider: 'twilio';
      callSid: string;
      fromNumber: string;
      toNumber: string;
      status: string;
    }
  | {
      ok: false;
      reason: 'not_configured' | 'provider_error';
      message: string;
    };

export interface TelephonyChannel {
  isConfigured(): boolean;
  initiateCall(input: InitiateCallInput): Promise<InitiateCallResult>;
  /**
   * Verify a Twilio status-callback signature (X-Twilio-Signature).
   * Returns true when configured and the signature matches, false otherwise.
   * When no auth token is configured this returns false (cannot verify).
   */
  verifyWebhookSignature(fullUrl: string, params: Record<string, string>, signature: string | undefined): boolean;
}

function twilioBasicAuth(sid: string, token: string): string {
  return Buffer.from(`${sid}:${token}`).toString('base64');
}

/**
 * Twilio request validation: HMAC-SHA1 of (URL + sorted POST params concatenated
 * as key+value), keyed by the auth token, base64-encoded. Mirrors Twilio's
 * documented validation algorithm without pulling in the Twilio SDK.
 */
function computeTwilioSignature(authToken: string, fullUrl: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  let data = fullUrl;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

export function createTelephonyChannel(log: FastifyBaseLogger): TelephonyChannel {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const callerId = process.env.TWILIO_CALLER_ID?.trim();

  const configured = Boolean(sid && authToken && callerId);
  if (!configured) {
    log.warn('Telephony (CTI) not configured — set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_CALLER_ID to enable click-to-call.');
  }

  return {
    isConfigured(): boolean {
      return configured;
    },

    verifyWebhookSignature(fullUrl, params, signature): boolean {
      if (!authToken || !signature) return false;
      const expected = computeTwilioSignature(authToken, fullUrl, params);
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      if (a.length !== b.length) return false;
      try {
        return crypto.timingSafeEqual(a, b);
      } catch {
        return false;
      }
    },

    async initiateCall(input): Promise<InitiateCallResult> {
      if (!configured || !sid || !authToken || !callerId) {
        return {
          ok: false,
          reason: 'not_configured',
          message:
            'Telephony not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_CALLER_ID in comm-service environment.',
        };
      }

      // TwiML the call runs once answered. A minimal default keeps the call
      // open so the agent's outbound leg connects; override via env for IVR/bridge.
      const twimlUrl =
        process.env.TELEPHONY_TWIML_URL?.trim() ||
        'http://demo.twilio.com/docs/voice.xml';
      const statusCallbackUrl = process.env.TELEPHONY_STATUS_CALLBACK_URL?.trim();

      const form = new URLSearchParams({
        To: input.toNumber,
        From: callerId,
        Url: twimlUrl,
      });
      if (statusCallbackUrl) {
        form.set('StatusCallback', statusCallbackUrl);
        form.set('StatusCallbackMethod', 'POST');
        // Request granular status events so completion (and duration) is reported.
        for (const evt of ['initiated', 'ringing', 'answered', 'completed']) {
          form.append('StatusCallbackEvent', evt);
        }
      }

      try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${twilioBasicAuth(sid, authToken)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          log.warn({ status: res.status, body: text.slice(0, 500) }, 'Twilio Calls API returned an error');
          return {
            ok: false,
            reason: 'provider_error',
            message: `Twilio call failed (HTTP ${res.status}).`,
          };
        }

        const data = (await res.json()) as { sid?: string; status?: string };
        const callSid = data.sid ?? '';
        log.info({ tenantId: input.tenantId, toNumber: input.toNumber, callSid }, 'Twilio outbound call placed');
        return {
          ok: true,
          provider: 'twilio',
          callSid,
          fromNumber: callerId,
          toNumber: input.toNumber,
          status: data.status ?? 'queued',
        };
      } catch (err) {
        log.warn({ err }, 'Twilio call request failed');
        return {
          ok: false,
          reason: 'provider_error',
          message: 'Telephony provider request failed.',
        };
      }
    },
  };
}
