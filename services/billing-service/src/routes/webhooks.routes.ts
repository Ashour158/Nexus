import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import type { BillingPrisma } from '../prisma.js';

export async function registerWebhooksRoutes(
  app: FastifyInstance,
  prisma: BillingPrisma,
  producer: NexusProducer
): Promise<void> {
  await app.register(
    async (r) => {
      // ─── STRIPE WEBHOOK ──────────────────────────────────────────────────
      // No auth guard — validated via Stripe-Signature header instead
      r.post(
        '/webhooks/stripe',
        {
          config: { rawBody: true },
        },
        async (request: FastifyRequest, reply: FastifyReply) => {
          const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
          const stripeKey = process.env.STRIPE_SECRET_KEY;

          if (!webhookSecret || !stripeKey) {
            app.log.error('STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET not configured');
            return reply.code(500).send({ success: false, error: 'Stripe not configured' });
          }

          const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

          const sig = request.headers['stripe-signature'] as string | undefined;
          if (!sig) {
            return reply.code(400).send({ success: false, error: 'Missing Stripe-Signature header' });
          }

          let event: Stripe.Event;
          try {
            // Use raw body for signature verification
            const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(request.body));
            event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Webhook signature verification failed';
            app.log.warn({ err }, 'Stripe webhook signature verification failed');
            return reply.code(400).send({ success: false, error: message });
          }

          try {
            switch (event.type) {
              case 'invoice.payment_succeeded': {
                const stripeInvoice = event.data.object as Stripe.Invoice;
                if (stripeInvoice.id) {
                  const invoice = await prisma.invoice.findFirst({
                    where: { stripeInvoiceId: stripeInvoice.id, deletedAt: null },
                  });
                  if (invoice && invoice.status !== 'PAID') {
                    await prisma.invoice.update({
                      where: { id: invoice.id },
                      data: { status: 'PAID', paidAt: new Date() },
                    });
                    try {
                      await producer.publish(TOPICS.PAYMENTS, {
                        type: 'payment.received',
                        tenantId: invoice.tenantId,
                        invoiceId: invoice.id,
                        amount: stripeInvoice.amount_paid / 100,
                        currency: (stripeInvoice.currency ?? 'usd').toUpperCase(),
                        stripeInvoiceId: stripeInvoice.id,
                      });
                    } catch (kafkaErr) {
                      app.log.warn({ kafkaErr }, 'Failed to publish payment.received from Stripe webhook');
                    }
                  }
                }
                break;
              }

              case 'invoice.payment_failed': {
                const stripeInvoice = event.data.object as Stripe.Invoice;
                if (stripeInvoice.id) {
                  const invoice = await prisma.invoice.findFirst({
                    where: { stripeInvoiceId: stripeInvoice.id, deletedAt: null },
                  });
                  if (invoice && invoice.status === 'OPEN') {
                    await prisma.invoice.update({
                      where: { id: invoice.id },
                      data: { status: 'PAST_DUE' },
                    });
                  }
                }
                break;
              }

              case 'customer.subscription.deleted': {
                const stripeSub = event.data.object as Stripe.Subscription;
                if (stripeSub.id) {
                  const sub = await prisma.subscription.findFirst({
                    where: { stripeSubId: stripeSub.id, deletedAt: null },
                  });
                  if (sub && sub.status !== 'CANCELLED') {
                    await prisma.subscription.update({
                      where: { id: sub.id },
                      data: {
                        status: 'CANCELLED',
                        cancelledAt: new Date(),
                      },
                    });
                    try {
                      await producer.publish(TOPICS.PAYMENTS, {
                        type: 'subscription.cancelled',
                        tenantId: sub.tenantId,
                        subscriptionId: sub.id,
                      });
                    } catch (kafkaErr) {
                      app.log.warn({ kafkaErr }, 'Failed to publish subscription.cancelled from Stripe webhook');
                    }
                  }
                }
                break;
              }

              default:
                app.log.info({ type: event.type }, 'Unhandled Stripe event type');
            }
          } catch (err) {
            app.log.error({ err, eventType: event.type }, 'Error processing Stripe webhook event');
            // Return 200 to prevent Stripe retrying for processing errors
          }

          return reply.send({ received: true });
        }
      );
    },
    { prefix: '/api/v1/billing' }
  );
}
