/**
 * Push channel — sends a push notification via Firebase Cloud Messaging (FCM)
 * legacy HTTP API using global `fetch` (no SDK dependency). It is fully
 * env-gated: when `FCM_SERVER_KEY` is not set (and no `WEB_PUSH_ENDPOINT`
 * override is provided) the channel becomes a guarded no-op that logs
 * "push not configured" and returns cleanly. It NEVER throws — a send failure
 * is caught and logged so a consumer is never blocked by push delivery.
 *
 * `WEB_PUSH_ENDPOINT` / `WEB_PUSH_KEY` allow pointing at an alternative
 * FCM-style relay (e.g. a self-hosted web-push gateway) that accepts the same
 * `{ to, notification, data }` JSON body with an `Authorization: key=...`
 * header. When only `WEB_PUSH_*` are set, they take precedence over the
 * default FCM endpoint.
 */

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
  /** Whether FCM / web-push is configured. When false, `send` is a logged no-op that never throws. */
  isConfigured(): boolean;
  send(envelope: PushEnvelope): Promise<void>;
}

type Logger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

const DEFAULT_FCM_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';

export function createPushChannel(log: Logger): PushChannel {
  const webPushEndpoint = process.env.WEB_PUSH_ENDPOINT?.trim();
  const webPushKey = process.env.WEB_PUSH_KEY?.trim();
  const fcmServerKey = process.env.FCM_SERVER_KEY?.trim();

  // WEB_PUSH_* takes precedence when supplied; otherwise fall back to FCM.
  const endpoint = webPushEndpoint || DEFAULT_FCM_ENDPOINT;
  const serverKey = webPushKey || fcmServerKey;

  if (!serverKey) {
    log.warn(
      'FCM_SERVER_KEY / WEB_PUSH_KEY not configured — push not configured; push channel will skip sending.'
    );
    return {
      isConfigured: () => false,
      async send(envelope) {
        log.info(
          { to: envelope.to },
          '[push-channel] skipped (push not configured)'
        );
      },
    };
  }

  return {
    isConfigured: () => true,
    async send(envelope) {
      if (!envelope.to?.trim()) {
        log.info('[push-channel] skipped (no device token)');
        return;
      }
      try {
        const payload = {
          to: envelope.to,
          notification: {
            title: envelope.title,
            body: envelope.body,
          },
          data: {
            ...(envelope.actionUrl ? { actionUrl: envelope.actionUrl } : {}),
            ...(envelope.data ?? {}),
          },
        };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        const res = (await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `key=${serverKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
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
            'push send failed'
          );
          // NOT-05: propagate a real delivery failure so the consumer retries / DLQs.
          throw new Error(`push send failed with status ${res.status}`);
        }
        log.info({ to: envelope.to }, 'push sent');
      } catch (err) {
        // NOT-05: rethrow genuine send errors. The unconfigured no-op and the
        // "no device token" guard above return early and never reach here, so
        // neither is treated as a delivery failure.
        log.error({ err, to: envelope.to }, 'push send failed');
        throw err;
      }
    },
  };
}
