import type { NexusKafkaEvent } from '@nexus/shared-types';
import { NotFoundError } from '@nexus/service-utils';
import type { PrismaClient } from '../../../../node_modules/.prisma/integration-client/index.js';
import type { IntegrationPrisma } from '../prisma.js';
import type { createFieldCrypto } from '../lib/crypto.js';
import { signWebhookBody } from '../lib/crypto.js';
import { randomBytes } from 'node:crypto';
import type {
  CreateWebhookSubscriptionInput,
  UpdateWebhookSubscriptionInput,
} from '@nexus/validation';
import { alsStore } from '../request-context.js';

type Crypto = ReturnType<typeof createFieldCrypto>;

type DeliveryWithSub = Awaited<
  ReturnType<
    PrismaClient['webhookDelivery']['findMany']
  >
>[number] & {
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
          status: 'FAILED',
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

    const body = JSON.stringify({
      id: row.id,
      type: row.eventType,
      payload: row.payload,
    });
    const sig = signWebhookBody(plainSecret, body);
    const attempt = row.attemptCount + 1;

    try {
      const res = await fetch(row.subscription.targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Nexus-Event': row.eventType,
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
      const rows = await prisma.webhookSubscription.findMany({ orderBy: { createdAt: 'desc' } });
      return rows.map(({ secret: _s, ...r }) => r);
    },

    async createSubscription(input: CreateWebhookSubscriptionInput) {
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

      let done = 0;
      for (const d of pending) {
        await deliverOne(d as DeliveryWithSub);
        done += 1;
      }
      return done;
    },
  };
}
