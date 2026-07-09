/**
 * Nexus Queue — BullMQ wrapper with dead-letter support.
 *
 * Usage:
 *   import { NexusQueue } from '@nexus/queue';
 *   const emailQueue = new NexusQueue('emails');
 *   await emailQueue.addJob('send-welcome', { userId: '123' });
 *   emailQueue.processJob('send-welcome', async (job) => { ... });
 */

import { Queue, Worker, type Job, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';

export interface QueueJob {
  name: string;
  data: unknown;
  opts?: JobsOptions;
}

export class NexusQueue {
  private queue: Queue;
  private redis: Redis;
  private workers = new Map<string, Worker>();

  constructor(
    private readonly name: string,
    opts: { redisUrl?: string; defaultJobOptions?: JobsOptions } = {}
  ) {
    this.redis = new Redis(opts.redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    this.queue = new Queue(name, {
      connection: this.redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 86400, count: 5000 },
        ...opts.defaultJobOptions,
      },
    });
  }

  async addJob<T = unknown>(name: string, data: T, opts?: JobsOptions): Promise<Job<T>> {
    return this.queue.add(name, data, opts);
  }

  processJob<T = unknown>(
    name: string,
    processor: (job: Job<T>) => Promise<unknown>
  ): void {
    const worker = new Worker<T>(
      this.name,
      async (job) => {
        if (job.name === name) {
          return processor(job);
        }
      },
      { connection: this.redis }
    );
    this.workers.set(name, worker);

    worker.on('failed', (job, err) => {
      console.error(`[${this.name}] Job ${job?.id} failed:`, err);
    });
  }

  async getJobState(jobId: string): Promise<string | undefined> {
    const job = await this.queue.getJob(jobId);
    return job?.getState();
  }

  async retryJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.retry();
    }
  }

  async getFailedJobs(start = 0, end = 100): Promise<Job[]> {
    return this.queue.getFailed(start, end);
  }

  async close(): Promise<void> {
    for (const worker of this.workers.values()) {
      await worker.close();
    }
    await this.queue.close();
    await this.redis.quit();
  }
}
