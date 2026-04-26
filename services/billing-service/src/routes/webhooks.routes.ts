import type { FastifyInstance } from 'fastify';
import type { FastifyBaseLogger } from 'fastify';
import Stripe from 'stripe';
import { PrismaClient } from '../../../../node_modules/.prisma/billing-client/index.js';

function mapStripeStatus(
  s: Stripe.Subscription.Status
): 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'UNPAID' {
  switch (s) {
    case 'trialing':
      return 'TRIALING';
    case 'active':
      return 'ACTIVE';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
    case 'unpaid':
      return 'CANCELED';
    default:
      return 'ACTIVE';
  }
}

export async function registerStripeWebhookRoutes(
  app: FastifyInstance,
  rawPrisma: PrismaClient,
  log: FastifyBaseLogger
): Promise<void> {
  await app.register(
    async (instance) => {
      instance.removeContentTypeParser('application/json');
      instance.addContentTypeParser(
        'application/json',
        { parseAs: 'buffer' },
        (_req, body: Buffer, done) => {
          done(null, body);
        }
      );

      instance.post('/billing/webhooks/stripe', async (request, reply) => {
        const buf = request.body as Buffer;
        const sig = request.headers['stripe-signature'];
        const whSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
        let event: Stripe.Event;
        if (!whSecret) {
          log.warn('STRIPE_WEBHOOK_SECRET not set — accepting unsigned webhook body (dev only)');
          event = JSON.parse(buf.toString('utf8')) as Stripe.Event;
        } else {
          if (typeof sig !== 'string') {
            return reply.code(400).send({ success: false, error: 'Missing stripe-signature' });
          }
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
            apiVersion: '2023-10-16',
          });
          event = stripe.webhooks.constructEvent(buf, sig, whSecret);
        }

        if (event.type === 'customer.subscription.updated') {
          const sub = event.data.object as Stripe.Subscription;
          const row = await rawPrisma.subscription.findFirst({
            where: { stripeSubId: sub.id },
          });
          if (row) {
            await rawPrisma.subscription.update({
              where: { id: row.id },
              data: {
                status: mapStripeStatus(sub.status),
                version: { increment: 1 },
              },
            });
          }
        }

        if (event.type === 'invoice.paid') {
          const inv = event.data.object as Stripe.Invoice;
          const stripeInvId = inv.id;
          if (stripeInvId) {
            const row = await rawPrisma.billingInvoice.findFirst({
              where: { stripeInvoiceId: stripeInvId },
            });
            if (row) {
              await rawPrisma.billingInvoice.update({
                where: { id: row.id },
                data: {
                  status: 'PAID',
                  paidAt: new Date(),
                  version: { increment: 1 },
                },
              });
            }
          }
        }

        if (event.type === 'invoice.payment_failed') {
          const inv = event.data.object as Stripe.Invoice;
          const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id;
          if (subId) {
            const row = await rawPrisma.subscription.findFirst({ where: { stripeSubId: subId } });
            if (row) {
              await rawPrisma.subscription.update({
                where: { id: row.id },
                data: { status: 'PAST_DUE', version: { increment: 1 } },
              });
            }
          }
        }

        return reply.send({ received: true });
      });
    },
    { prefix: '/api/v1' }
  );
}
