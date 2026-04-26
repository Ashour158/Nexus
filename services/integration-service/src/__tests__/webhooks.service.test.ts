import { describe, expect, it, vi } from 'vitest';
import { createFieldCrypto, signWebhookBody } from '../lib/crypto.js';
import { createWebhooksService } from '../services/webhooks.service.js';

describe('integration webhooks', () => {
  it('signWebhookBody produces stable HMAC hex', () => {
    const sig = signWebhookBody('secret', '{"a":1}');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });

  it('createFieldCrypto round-trips secrets', () => {
    const c = createFieldCrypto('12345678901234567890123456789012');
    const enc = c.encrypt('hello-webhook');
    expect(c.decrypt(enc)).toBe('hello-webhook');
  });

  it('processDeliveryQueue delivers with expected signature header', async () => {
    const key = '12345678901234567890123456789012';
    const crypto = createFieldCrypto(key);
    const plainSecret = 'a'.repeat(64);
    const enc = crypto.encrypt(plainSecret);

    const raw = {
      webhookDelivery: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'd1',
            attemptCount: 0,
            eventType: 'deal.created',
            payload: { x: 1 },
            subscription: {
              targetUrl: 'https://example.test/hook',
              secret: enc,
              isActive: true,
            },
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const prisma = {} as never;
    const webhooks = createWebhooksService({ prisma, raw: raw as never, crypto });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('ok'),
    });
    vi.stubGlobal('fetch', fetchMock);

    await webhooks.processDeliveryQueue(5);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = (init as { body: string }).body;
    const sigHeader = (init as { headers: Record<string, string> }).headers['X-Nexus-Signature'];
    expect(sigHeader).toBe(`sha256=${signWebhookBody(plainSecret, body)}`);
    vi.unstubAllGlobals();
  });
});
