/**
 * Push channel — sends a push notification via Firebase Cloud Messaging (FCM)
 * HTTP v1 API using global `fetch` (no SDK dependency).
 *
 * RR-H6: the legacy `POST /fcm/send` endpoint with an `Authorization: key=...`
 * server key was retired by Google and now rejects every request, so the channel
 * is migrated to the v1 API:
 *
 *   POST https://fcm.googleapis.com/v1/projects/{FCM_PROJECT_ID}/messages:send
 *   Authorization: Bearer <OAuth2 access token>
 *
 * The bearer is minted from a Google service account (client_email +
 * private_key) via the JWT-bearer grant — we sign the assertion with Node's
 * built-in `crypto` (RS256) and exchange it at the Google OAuth2 token endpoint,
 * so no extra dependency (google-auth-library) is required. Tokens are cached
 * in-process until shortly before expiry.
 *
 * The channel is fully env-gated. When any of `FCM_PROJECT_ID` /
 * `FCM_CLIENT_EMAIL` / `FCM_PRIVATE_KEY` is unset the channel becomes a guarded
 * no-op that logs "push not configured" and returns cleanly; `isConfigured()`
 * then reports `false` so `/health/channels` is truthful. A genuine send failure
 * (network / non-2xx) throws so the consumer retries / DLQs (RR-H5); the
 * unconfigured no-op and the "no device token" guard return early and never throw.
 */

import { createSign } from 'node:crypto';

export interface PushEnvelope {
  /** Device registration token / subscription id. */
  to: string;
  title: string;
  body: string;
  /** Optional deep-link surfaced to the client. */
  actionUrl?: string;
  /** Optional structured data payload. */
  data?: Record<string, string>;
}

export interface PushChannel {
  /** Whether FCM v1 is configured. When false, `send` is a logged no-op that never throws. */
  isConfigured(): boolean;
  send(envelope: PushEnvelope): Promise<void>;
}

type Logger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const JWT_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
const SEND_TIMEOUT_MS = 10_000;

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

async function timedFetch(
  url: string,
  init: Parameters<typeof fetch>[1]
): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  return (await fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  )) as unknown as {
    ok: boolean;
    status: number;
    text: () => Promise<string>;
    json: () => Promise<unknown>;
  };
}

/**
 * Mints (and caches) a Google OAuth2 access token for the FCM scope using the
 * service-account JWT-bearer grant. The returned token is cached in the closure
 * and refreshed ~2 minutes before it expires.
 */
function createTokenProvider(clientEmail: string, privateKey: string) {
  let cached: { token: string; expiresAt: number } | null = null;

  return async function getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (cached && cached.expiresAt - 120 > now) {
      return cached.token;
    }
    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
      iss: clientEmail,
      scope: FCM_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    };
    const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
      JSON.stringify(claims)
    )}`;
    const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);
    const assertion = `${signingInput}.${base64url(signature)}`;

    const res = await timedFetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: JWT_GRANT, assertion }).toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`FCM OAuth token request failed with status ${res.status}: ${detail}`);
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) {
      throw new Error('FCM OAuth token response missing access_token');
    }
    cached = {
      token: json.access_token,
      expiresAt: now + (json.expires_in ?? 3600),
    };
    return cached.token;
  };
}

export function createPushChannel(log: Logger): PushChannel {
  const projectId = process.env.FCM_PROJECT_ID?.trim();
  const clientEmail = process.env.FCM_CLIENT_EMAIL?.trim();
  // Private keys stored in env commonly carry literal "\n" sequences; normalise
  // them back to real newlines so the PEM parses.
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();

  if (!projectId || !clientEmail || !privateKey) {
    log.warn(
      'FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY not fully configured — push not configured; push channel will skip sending.'
    );
    return {
      isConfigured: () => false,
      async send(envelope) {
        log.info({ to: envelope.to }, '[push-channel] skipped (push not configured)');
      },
    };
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/messages:send`;
  const getAccessToken = createTokenProvider(clientEmail, privateKey);

  return {
    isConfigured: () => true,
    async send(envelope) {
      if (!envelope.to?.trim()) {
        log.info('[push-channel] skipped (no device token)');
        return;
      }
      try {
        const token = await getAccessToken();
        // FCM v1 requires all `data` values to be strings.
        const data: Record<string, string> = {
          ...(envelope.actionUrl ? { actionUrl: envelope.actionUrl } : {}),
          ...(envelope.data ?? {}),
        };
        const message: Record<string, unknown> = {
          token: envelope.to,
          notification: { title: envelope.title, body: envelope.body },
          ...(Object.keys(data).length > 0 ? { data } : {}),
        };
        const res = await timedFetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          log.error({ to: envelope.to, status: res.status, detail }, 'push send failed');
          // RR-H5: propagate a real delivery failure so the consumer retries / DLQs.
          throw new Error(`push send failed with status ${res.status}`);
        }
        log.info({ to: envelope.to }, 'push sent');
      } catch (err) {
        // RR-H5: rethrow genuine send errors. The unconfigured no-op and the
        // "no device token" guard above return early and never reach here, so
        // neither is treated as a delivery failure.
        log.error({ err, to: envelope.to }, 'push send failed');
        throw err;
      }
    },
  };
}
