import 'dotenv/config';
import { startTracing } from '@nexus/service-utils/tracing';
import {
  checkDatabase,
  checkKafka,
  createService,
  globalErrorHandler,
  registerHealthRoutes,
  startService,
} from '@nexus/service-utils';
import { getKafkaClient } from '@nexus/kafka';
import { PrismaClient } from '../../../node_modules/.prisma/outbox-relay-client/index.js';
import type { Producer } from 'kafkajs';
import { loadConfig, getServiceConfigs } from './config.js';
import { OutboxRelay } from './relay.js';
import { DLQReplay } from './dlq-replay.js';

startTracing({ serviceName: 'outbox-relay' });

const config = loadConfig();
const serviceConfigs = getServiceConfigs(config);

const port = Number(config.PORT);
const jwtSecret = config.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 characters.');
}

const app = await createService({
  name: 'outbox-relay',
  port,
  jwtSecret,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
});

app.setErrorHandler(globalErrorHandler);

const kafka = getKafkaClient();
const producer: Producer = kafka.producer({
  idempotent: true,
  transactionTimeout: 30_000,
  retry: { retries: 8, initialRetryTime: 100 },
});

const services = serviceConfigs.map((cfg) => ({
  name: cfg.name,
  prisma: new PrismaClient({
    datasources: {
      db: { url: cfg.dbUrl },
    },
    log: ['error'],
  }),
}));

const relay = new OutboxRelay({
  producer,
  services,
  log: app.log,
  pollIntervalMs: config.POLL_INTERVAL_MS,
  batchSize: config.BATCH_SIZE,
  maxRetries: config.MAX_RETRIES,
  dlqEnabled: config.DLQ_ENABLED === 'true',
});

const dlqReplay = new DLQReplay({
  kafka,
  producer,
  log: app.log,
  enabled: config.DLQ_REPLAY_ENABLED === 'true',
  batchSize: config.DLQ_REPLAY_BATCH_SIZE,
  intervalMs: config.DLQ_REPLAY_INTERVAL_MS,
});

registerHealthRoutes(app, 'outbox-relay', [
  async () => checkKafka(kafka),
  ...relay.getServiceConnections().map((svc) => async () => {
    const result = await checkDatabase(svc.prisma);
    return { ...result, name: `db-${svc.name}` };
  }),
]);

app.addHook('onClose', async () => {
  await relay.stop();
  await dlqReplay.stop();
});

await producer.connect();
await relay.start();
await dlqReplay.start();

await startService(app, port, async () => {
  app.post('/admin/dlq/replay', async (request, reply) => {
    const body = request.body as { topic?: string; maxMessages?: number };

    if (!body.topic || typeof body.topic !== 'string') {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'topic is required and must be a string',
        },
      });
    }

    if (body.maxMessages !== undefined && typeof body.maxMessages !== 'number') {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'maxMessages must be a number',
        },
      });
    }

    try {
      const result = await dlqReplay.replayBatch(body.topic, body.maxMessages);
      return { success: true, data: result };
    } catch (err) {
      app.log.error({ err, topic: body.topic }, 'DLQ replay request failed');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'REPLAY_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  });

  app.get('/admin/dlq/stats', async (_request, reply) => {
    try {
      const stats = await dlqReplay.getStats();
      return { success: true, data: { topics: stats } };
    } catch (err) {
      app.log.error({ err }, 'DLQ stats request failed');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'STATS_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  });
});
