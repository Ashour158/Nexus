/**
 * Kafka DLQ Monitor
 *
 * Scans all `*.dlq` topics for messages produced in the last 5 minutes.
 * Exits with code 1 if any recent DLQ messages are found (CI/CD gate).
 * Use `--alert` to emit console error lines suitable for PagerDuty hooks.
 *
 * Usage:
 *   tsx scripts/monitor-dlq.ts
 *   tsx scripts/monitor-dlq.ts --alert
 */

import { Kafka, logLevel } from 'kafkajs';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const KAFKA_SSL = process.env.KAFKA_SSL === 'true';
const KAFKA_SASL_USERNAME = process.env.KAFKA_SASL_USERNAME;
const KAFKA_SASL_PASSWORD = process.env.KAFKA_SASL_PASSWORD;

const kafka = new Kafka({
  clientId: 'nexus-dlq-monitor',
  brokers: KAFKA_BROKERS,
  ssl: KAFKA_SSL ? {} : false,
  sasl: KAFKA_SASL_USERNAME
    ? {
        mechanism: 'plain',
        username: KAFKA_SASL_USERNAME,
        password: KAFKA_SASL_PASSWORD ?? '',
      }
    : undefined,
  logLevel: logLevel.WARN,
});

async function main() {
  const alertMode = process.argv.includes('--alert');
  const admin = kafka.admin();
  await admin.connect();

  const topics = await admin.listTopics();
  const dlqTopics = topics.filter((t) => t.endsWith('.dlq'));

  console.log(
    JSON.stringify({
      level: 'info',
      message: 'DLQ monitor starting',
      dlqTopics,
      timestamp: new Date().toISOString(),
    })
  );

  if (dlqTopics.length === 0) {
    await admin.disconnect();
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'No DLQ topics found',
        timestamp: new Date().toISOString(),
      })
    );
    process.exit(0);
  }

  const consumer = kafka.consumer({
    groupId: `dlq-monitor-${Date.now()}`,
    sessionTimeout: 30_000,
  });
  await consumer.connect();

  for (const topic of dlqTopics) {
    await consumer.subscribe({ topic, fromBeginning: true });
  }

  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  let foundRecent = false;
  let messageCount = 0;
  const MAX_MESSAGES = 1000;

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      messageCount++;
      if (messageCount > MAX_MESSAGES) {
        return;
      }

      const ts = Number(message.timestamp);
      if (ts >= fiveMinutesAgo) {
        foundRecent = true;
        const entry = {
          level: 'warn',
          topic,
          partition,
          offset: message.offset,
          messageTimestamp: new Date(ts).toISOString(),
          key: message.key?.toString(),
          value: message.value?.toString(),
          headers: Object.fromEntries(
            Object.entries(message.headers ?? {}).map(([k, v]) => [
              k,
              v?.toString(),
            ])
          ),
        };
        console.log(JSON.stringify(entry));
        if (alertMode) {
          console.error(
            JSON.stringify({ alert: 'DLQ_MESSAGE_DETECTED', ...entry })
          );
        }
      }
    },
  });

  // Allow time to consume messages
  await new Promise((r) => setTimeout(r, 5000));
  await consumer.stop();
  await consumer.disconnect();
  await admin.disconnect();

  if (foundRecent) {
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      level: 'info',
      message: 'No recent DLQ messages found',
      checkedTopics: dlqTopics,
      messagesScanned: messageCount,
      timestamp: new Date().toISOString(),
    })
  );
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      level: 'fatal',
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    })
  );
  process.exit(1);
});
