import type { Kafka, Producer, KafkaMessage } from 'kafkajs';
import type { FastifyBaseLogger } from 'fastify';

export interface DLQReplayOptions {
  kafka: Kafka;
  producer: Producer;
  log: FastifyBaseLogger;
  enabled: boolean;
  batchSize: number;
  intervalMs: number;
  /** How long to wait for the consumer to fetch messages before stopping. Default 3000ms. */
  fetchTimeoutMs?: number;
}

export interface ReplayResult {
  topic: string;
  replayed: number;
  failed: number;
  errors: string[];
}

export interface DLQTopicStats {
  topic: string;
  /** Current retained backlog depth derived from Kafka low/high offsets. */
  depth: number;
}

export interface DLQReplayMetrics {
  totalReplayed: number;
  totalFailed: number;
  lastReplayAt: string | null;
}

export class DLQReplay {
  private kafka: Kafka;
  private producer: Producer;
  private log: FastifyBaseLogger;
  private enabled: boolean;
  private batchSize: number;
  private intervalMs: number;
  private fetchTimeoutMs: number;
  private running = false;
  private backgroundInterval: NodeJS.Timeout | null = null;
  private activeReplays = new Set<string>();
  private metrics: DLQReplayMetrics = {
    totalReplayed: 0,
    totalFailed: 0,
    lastReplayAt: null,
  };

  constructor(opts: DLQReplayOptions) {
    this.kafka = opts.kafka;
    this.producer = opts.producer;
    this.log = opts.log;
    this.enabled = opts.enabled;
    this.batchSize = opts.batchSize;
    this.intervalMs = opts.intervalMs;
    this.fetchTimeoutMs = opts.fetchTimeoutMs ?? 3000;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  getMetrics(): DLQReplayMetrics {
    return { ...this.metrics };
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      this.log.info('DLQ replay is disabled');
      return;
    }
    this.running = true;
    this.backgroundInterval = setInterval(() => {
      this.runBackgroundReplay().catch((err) => {
        this.log.error({ err }, 'Background DLQ replay failed');
      });
    }, this.intervalMs);
    this.log.info('DLQ replay started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = null;
    }
    this.log.info('DLQ replay stopped');
  }

  async replayBatch(topic: string, maxMessages?: number): Promise<ReplayResult> {
    if (!this.enabled) {
      throw new Error('DLQ replay is disabled');
    }
    if (!topic.endsWith('.dlq')) {
      throw new Error(`Topic "${topic}" is not a DLQ topic (must end with .dlq)`);
    }
    if (this.activeReplays.has(topic)) {
      throw new Error(`Replay already in progress for topic ${topic}`);
    }

    this.activeReplays.add(topic);
    const limit = maxMessages ?? this.batchSize;
    const groupId = `dlq-replay-${topic}`;

    const consumer = this.kafka.consumer({
      groupId,
      maxWaitTimeInMs: 1000,
      sessionTimeout: 30_000,
      heartbeatInterval: 3_000,
    });

    const result: ReplayResult = {
      topic,
      replayed: 0,
      failed: 0,
      errors: [],
    };

    try {
      await consumer.connect();
      // fromBeginning covers the no-committed-offsets case; kafkajs forbids
      // seek() before run() ("Consumer group was not initialized"), so no
      // manual rewind here.
      await consumer.subscribe({ topic, fromBeginning: true });

      let processedCount = 0;

      const runPromise = consumer.run({
        autoCommit: false,
        eachBatchAutoResolve: false,
        eachBatch: async ({
          batch,
          resolveOffset,
          commitOffsetsIfNecessary,
          heartbeat,
        }) => {
          for (const message of batch.messages) {
            if (processedCount >= limit) break;

            try {
              await this.processMessage(topic, message, result);
              resolveOffset(message.offset);
            } catch (err) {
              result.failed++;
              this.metrics.totalFailed++;
              result.errors.push(
                `Offset ${message.offset}: ${err instanceof Error ? err.message : String(err)}`
              );
              this.log.warn(
                { err, topic, offset: message.offset, partition: batch.partition },
                'DLQ replay failed for individual message; leaving in DLQ'
              );
            }

            processedCount++;
            await heartbeat();
          }

          await commitOffsetsIfNecessary();
        },
      });

      // Wait until the batch limit is hit or consumption stalls. A fixed short
      // sleep raced the consumer-group join (often >3s), stopping the consumer
      // before it ever fetched a message.
      const maxWaitMs = 60_000;
      const start = Date.now();
      let lastProgress = { count: -1, at: Date.now() };
      while (Date.now() - start < maxWaitMs && processedCount < limit) {
        if (processedCount !== lastProgress.count) {
          lastProgress = { count: processedCount, at: Date.now() };
        } else if (
          processedCount > 0 &&
          Date.now() - lastProgress.at >= this.fetchTimeoutMs
        ) {
          break; // consumed something, then went quiet — topic is drained
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      await consumer.stop();
      await runPromise;

      this.metrics.lastReplayAt = new Date().toISOString();
      this.log.info(
        { topic, replayed: result.replayed, failed: result.failed },
        'DLQ replay batch completed'
      );

      return result;
    } finally {
      this.activeReplays.delete(topic);
      try {
        await consumer.disconnect();
      } catch {
        // ignore disconnect errors
      }
    }
  }

  private async processMessage(
    dlqTopic: string,
    message: KafkaMessage,
    result: ReplayResult
  ): Promise<void> {
    const originalTopic = message.headers?.originalTopic?.toString();
    if (!originalTopic) {
      throw new Error('Missing originalTopic header');
    }

    const headers: Record<string, string> = {};
    if (message.headers) {
      for (const [key, value] of Object.entries(message.headers)) {
        if (value === undefined || value === null) continue;
        if (Buffer.isBuffer(value)) {
          headers[key] = value.toString();
        } else if (typeof value === 'string') {
          headers[key] = value;
        } else {
          headers[key] = String(value);
        }
      }
    }

    headers.replayedAt = new Date().toISOString();

    await this.producer.send({
      topic: originalTopic,
      messages: [
        {
          key: message.key ?? null,
          value: message.value ?? null,
          headers,
        },
      ],
    });

    result.replayed++;
    this.metrics.totalReplayed++;
    this.log.info(
      { dlqTopic, originalTopic, offset: message.offset },
      'Replayed DLQ message to original topic'
    );
  }

  async getStats(): Promise<DLQTopicStats[]> {
    const admin = this.kafka.admin();
    await admin.connect();
    try {
      const topics = await admin.listTopics();
      const dlqTopics = topics.filter((t) => t.endsWith('.dlq'));

      const stats: DLQTopicStats[] = [];
      for (const topic of dlqTopics) {
        try {
          const offsets = await admin.fetchTopicOffsets(topic);
          const depth = offsets.reduce(
            (sum, o) => sum + (parseInt(o.high, 10) - parseInt(o.low, 10)),
            0
          );
          stats.push({ topic, depth });
        } catch (err) {
          this.log.warn({ err, topic }, 'Failed to fetch DLQ topic offsets');
        }
      }

      return stats.sort((a, b) => a.topic.localeCompare(b.topic));
    } finally {
      await admin.disconnect();
    }
  }

  private async discoverDLQTopics(): Promise<string[]> {
    const admin = this.kafka.admin();
    await admin.connect();
    try {
      const topics = await admin.listTopics();
      return topics.filter((t) => t.endsWith('.dlq'));
    } finally {
      await admin.disconnect();
    }
  }

  private async runBackgroundReplay(): Promise<void> {
    if (!this.running) return;

    const topics = await this.discoverDLQTopics();
    for (const topic of topics) {
      if (!this.running) break;
      if (this.activeReplays.has(topic)) {
        this.log.debug({ topic }, 'Skipping background replay, already in progress');
        continue;
      }

      try {
        const result = await this.replayBatch(topic, this.batchSize);
        if (result.replayed > 0) {
          this.log.info(
            { topic, replayed: result.replayed, failed: result.failed },
            'Background DLQ replay completed'
          );
        }
      } catch (err) {
        this.log.warn({ err, topic }, 'Background DLQ replay failed for topic');
      }
    }
  }
}
