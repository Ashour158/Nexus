import { NexusProducer, TOPICS } from '@nexus/kafka';

const producer = new NexusProducer('fixture.billing');
await producer.publish(TOPICS.PAYMENTS, {
  type: 'invoice.paid',
  tenantId: 'fixture',
});
