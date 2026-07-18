import type { NexusKafkaEvent } from '@nexus/shared-types';
import { NotFoundError, ValidationError } from '@nexus/service-utils';
import type { PrismaClient } from '../../../../node_modules/.prisma/integration-client/index.js';
import type { IntegrationPrisma } from '../prisma.js';
import type { createFieldCrypto } from '../lib/crypto.js';
import { signWebhookBody } from '../lib/crypto.js';
import { randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import type {
  CreateWebhookSubscriptionInput,
  UpdateWebhookSubscriptionInput,
} from '@nexus/validation';
import { alsStore } from '../request-context.js';

type Crypto = ReturnType<typeof createFieldCrypto>;

const PRIVATE_IP_RE = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
];

async function isSsrfSafe(url: string): Promise<boolean> {
  try {
    const { hostname } = new URL(url);
    const { address } = await lookup(hostname);
    return !PRIVATE_IP_RE.some((re) => re.test(address));
  } catch {
    return false;
  }
}

type DeliveryWithSub = Awaited<
  ReturnType<
    PrismaClient['webhookDelivery']['findMany']
  >
>[number] & {
  idempotencyKey?: string;
  subscription: {
    targetUrl: string;
    secret: string;
    isActive: boolean;
  };
};

export function createWebhooksService(deps: {
  prisma: IntegrationPrisma;
  raw: PrismaClient;
  crypto: Crypto;
}) {
  const { prisma, raw, crypto } = deps;

  function newSigningSecret(): string {
    return randomBytes(32).toString('hex');
  }

  /** Enforce https-only subscriber URLs at write time (defence-in-depth on top
   * of the delivery-time SSRF/private-IP block). Throws ValidationError. */
  function assertHttpsUrl(targetUrl: string): void {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      throw new ValidationError('targetUrl must be a valid URL');
    }
    if (parsed.protocol !== 'https:') {
      throw new ValidationError('targetUrl must use https');
    }
  }

  async function scheduleRetry(
    id: string,
    attempt: number,
    httpStatus: number,
    responseBody: string
  ): Promise<void> {
    const max = 5;
    if (attempt >= max) {
      await raw.webhookDelivery.update({
        where: { id },
        data: {
          // Retry budget exhausted — terminal DEAD (distinct from a single-shot FAILED).
          status: 'DEAD',
          httpStatus: httpStatus || null,
          responseBody: responseBody.slice(0, 8000),
          attemptCount: attempt,
          nextRetryAt: null,
        },
      });
      return;
    }
    const delayMs = Math.min(60_000, 1000 * 2 ** (attempt - 1));
    await raw.webhookDelivery.update({
      where: { id },
      data: {
        status: 'RETRYING',
        httpStatus: httpStatus || null,
        responseBody: responseBody.slice(0, 8000),
        attemptCount: attempt,
        nextRetryAt: new Date(Date.now() + delayMs),
      },
    });
  }

  async function deliverOne(row: DeliveryWithSub): Promise<void> {
    if (!row.subscription?.isActive) {
      await raw.webhookDelivery.update({
        where: { id: row.id },
        data: { status: 'FAILED', responseBody: 'subscription_inactive' },
      });
      return;
    }

    let plainSecret: string;
    try {
      plainSecret = crypto.decrypt(row.subscription.secret);
    } catch {
      await raw.webhookDelivery.update({
        where: { id: row.id },
        data: { status: 'FAILED', responseBody: 'decrypt_failed' },
      });
      return;
    }

    if (!(await isSsrfSafe(row.subscription.targetUrl))) {
      await raw.webhookDelivery.update({
        where: { id: row.id },
        data: { status: 'FAILED', responseBody: 'ssrf_blocked_private_ip' },
      });
      return;
    }

    const body = JSON.stringify({
      id: row.id,
      type: row.eventType,
      payload: row.payload,
      idempotencyKey: row.idempotencyKey ?? row.id,
    });
    const sig = signWebhookBody(plainSecret, body);
    const attempt = row.attemptCount + 1;

    try {
      const res = await fetch(row.subscription.targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Nexus-Event': row.eventType,
          'X-Nexus-Delivery': row.id,
          'X-Nexus-Signature': `sha256=${sig}`,
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      const text = await res.text().catch(() => '');
      if (res.ok) {
        await raw.webhookDelivery.update({
          where: { id: row.id },
          data: {
            status: 'DELIVERED',
            httpStatus: res.status,
            responseBody: text.slice(0, 8000),
            deliveredAt: new Date(),
            attemptCount: attempt,
            nextRetryAt: null,
          },
        });
        return;
      }
      await scheduleRetry(row.id, attempt, res.status, text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'fetch_error';
      await scheduleRetry(row.id, attempt, 0, msg);
    }
  }

  return {
    async listSubscriptions() {
      const rows = await prisma.webhookSubscription.findMany({
    take: 500, orderBy: { createdAt: 'desc' } });
      return rows.map(({ secret: _s, ...r }) => r);
    },

    async createSubscription(input: CreateWebhookSubscriptionInput) {
      assertHttpsUrl(input.targetUrl);
      const plain = newSigningSecret();
      const enc = crypto.encrypt(plain);
      const tid = alsStore.get('tenantId') as string;
      const row = await prisma.webhookSubscription.create({
        data: {
          tenantId: tid,
          name: input.name,
          targetUrl: input.targetUrl,
          events: input.events,
          secret: enc,
        },
      });
      const { secret: _s, ...rest } = row;
      return { subscription: rest, signingSecret: plain };
    },

    async updateSubscription(id: string, input: UpdateWebhookSubscriptionInput) {
      if (input.targetUrl !== undefined) assertHttpsUrl(input.targetUrl);
      const cur = await prisma.webhookSubscription.findFirst({ where: { id } });
      if (!cur) throw new NotFoundError('WebhookSubscription', id);
      const row = await prisma.webhookSubscription.update({
        where: { id },
        data: {
          ...input,
          version: { increment: 1 },
        },
      });
      const { secret: _s, ...rest } = row;
      return rest;
    },

    async deleteSubscription(id: string) {
      await prisma.webhookSubscription.delete({ where: { id } });
    },

    async enqueueFromDomainEvent(event: NexusKafkaEvent): Promise<void> {
      const eventType = event.type;
      const subs = await raw.webhookSubscription.findMany({
        where: {
          tenantId: event.tenantId,
          isActive: true,
          events: { has: eventType },
        },
      });
      if (subs.length === 0) return;
      const payload = { ...event };
      await raw.webhookDelivery.createMany({
        data: subs.map((s) => ({
          subscriptionId: s.id,
          tenantId: event.tenantId,
          eventType,
          payload: payload as object,
          status: 'PENDING' as const,
        })),
      });
    },

    /** Paginated delivery log for a subscription, newest first. Tenant-scoped; never leaks the secret. */
    async listDeliveries(subscriptionId: string, opts: { page: number; limit: number }) {
      // Confirm the subscription exists within the caller's tenant (prisma is tenant-scoped).
      const sub = await prisma.webhookSubscription.findFirst({
        where: { id: subscriptionId },
        select: { id: true },
      });
      if (!sub) throw new NotFoundError('WebhookSubscription', subscriptionId);

      const skip = (opts.page - 1) * opts.limit;
      const [rows, total] = await Promise.all([
        prisma.webhookDelivery.findMany({
          where: { subscriptionId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: opts.limit,
          select: {
            id: true,
            eventType: true,
            status: true,
            httpStatus: true,
            attemptCount: true,
            nextRetryAt: true,
            deliveredAt: true,
            createdAt: true,
          },
        }),
        prisma.webhookDelivery.count({ where: { subscriptionId } }),
      ]);
      return { data: rows, page: opts.page, limit: opts.limit, total };
    },

    /** Single delivery detail (may include responseBody). Tenant-scoped. Returns null if not found. */
    async getDelivery(deliveryId: string) {
      const row = await prisma.webhookDelivery.findFirst({
        where: { id: deliveryId },
        select: {
          id: true,
          subscriptionId: true,
          eventType: true,
          payload: true,
          status: true,
          httpStatus: true,
          responseBody: true,
          attemptCount: true,
          nextRetryAt: true,
          deliveredAt: true,
          createdAt: true,
        },
      });
      return row;
    },

    /** Rotate a subscription's signing secret. Returns the new plaintext secret ONCE. Tenant-scoped. */
    async rotateSecret(subscriptionId: string) {
      const cur = await prisma.webhookSubscription.findFirst({ where: { id: subscriptionId } });
      if (!cur) throw new NotFoundError('WebhookSubscription', subscriptionId);
      const plain = newSigningSecret();
      await prisma.webhookSubscription.update({
        where: { id: subscriptionId },
        data: { secret: crypto.encrypt(plain), version: { increment: 1 } },
      });
      return { id: subscriptionId, signingSecret: plain };
    },

    async replayDelivery(deliveryId: string): Promise<boolean> {
      const row = await raw.webhookDelivery.findFirst({
        where: { id: deliveryId },
        include: { subscription: true },
      });
      if (!row || !row.subscription?.isActive) return false;
      await raw.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'PENDING', attemptCount: 0, nextRetryAt: null, responseBody: null, httpStatus: null },
      });
      return true;
    },

    async processDeliveryQueue(batch = 25): Promise<number> {
      const now = new Date();
      const pending = await raw.webhookDelivery.findMany({
        where: {
          OR: [
            { status: 'PENDING' },
            {
              status: 'RETRYING',
              OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
            },
          ],
        },
        take: batch,
        orderBy: { createdAt: 'asc' },
        include: { subscription: true },
      });

      // Deliver webhooks with bounded concurrency to avoid head-of-line blocking
      const CONCURRENCY = 10;
      let done = 0;
      for (let i = 0; i < pending.length; i += CONCURRENCY) {
        const chunk = pending.slice(i, i + CONCURRENCY);
        await Promise.allSettled(
          chunk.map((d) => deliverOne(d as unknown as DeliveryWithSub))
        );
        done += chunk.length;
      }
      return done;
    },
  };
}
