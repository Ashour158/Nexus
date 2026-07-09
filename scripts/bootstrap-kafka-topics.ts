#!/usr/bin/env tsx
/**
 * Bootstrap Kafka topics with proper partition count and replication factor.
 * Run once on cluster setup: pnpm tsx scripts/bootstrap-kafka-topics.ts
 */
import { Kafka } from 'kafkajs';

const BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const REPLICATION_FACTOR = Number(process.env.KAFKA_REPLICATION_FACTOR ?? '1');
const DEFAULT_PARTITIONS = 6;

const TOPICS = [
  { topic: 'nexus.crm.leads',              numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.crm.contacts',           numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.crm.accounts',           numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.crm.deals',              numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.crm.activities',         numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.finance.quotes',         numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.finance.invoices',       numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.finance.payments',       numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.finance.contracts',      numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.finance.commissions',    numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.automation.workflows',   numPartitions: 3 },
  { topic: 'nexus.integration.events',     numPartitions: 3 },
  { topic: 'nexus.blueprint.events',       numPartitions: 3 },
  { topic: 'nexus.platform.notifications', numPartitions: 3 },
  { topic: 'nexus.comms.emails',           numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.comms.calls',            numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.analytics.events',       numPartitions: DEFAULT_PARTITIONS },
  { topic: 'nexus.compliance.audit',       numPartitions: 3 },
];

async function main() {
  const kafka = new Kafka({ clientId: 'topic-bootstrap', brokers: BROKERS });
  const admin = kafka.admin();

  await admin.connect();
  console.log('Connected to Kafka at:', BROKERS.join(', '));

  const existing = new Set(await admin.listTopics());
  const toCreate = TOPICS
    .filter(t => !existing.has(t.topic))
    .map(t => ({ ...t, replicationFactor: REPLICATION_FACTOR }));

  if (toCreate.length === 0) {
    console.log('All topics already exist — nothing to do.');
    await admin.disconnect();
    return;
  }

  console.log(`Creating ${toCreate.length} topics:`, toCreate.map(t => t.topic).join(', '));
  await admin.createTopics({ topics: toCreate, waitForLeaders: true });
  console.log('Topics created successfully.');

  await admin.disconnect();
}

main().catch(err => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
