import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { NexusQueue } from '../index.js';

const mockQueue = {
  add: vi.fn(),
  getJob: vi.fn(),
  getFailed: vi.fn(),
  close: vi.fn(),
};

const mockWorker = {
  on: vi.fn(),
  close: vi.fn(),
};

vi.mock('bullmq', () => ({
  Queue: vi.fn(() => mockQueue),
  Worker: vi.fn(() => mockWorker),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn(() => ({
    quit: vi.fn(),
  })),
}));

describe('NexusQueue', () => {
  let queue: NexusQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = new NexusQueue('test-queue');
  });

  it('adds a job to the queue', async () => {
    mockQueue.add.mockResolvedValue({ id: 'job-1' });
    const job = await queue.addJob('send-email', { to: 'user@example.com' });
    expect(mockQueue.add).toHaveBeenCalledWith(
      'send-email',
      { to: 'user@example.com' },
      undefined
    );
    expect(job.id).toBe('job-1');
  });

  it('registers a processor', () => {
    queue.processJob('send-email', async (job) => {
      return { sent: true };
    });
    expect(mockWorker.on).toHaveBeenCalledWith('failed', expect.any(Function));
  });

  afterAll(async () => {
    await queue.close();
  });
});
