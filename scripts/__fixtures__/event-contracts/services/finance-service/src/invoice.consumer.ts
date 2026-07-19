import { NexusConsumer, TOPICS } from '@nexus/kafka';

export async function startInvoiceConsumer() {
  const consumer = new NexusConsumer('fixture.invoice');
  consumer.on('invoice.paid', async () => undefined);
  await consumer.subscribe([TOPICS.INVOICES]);
  return consumer;
}
