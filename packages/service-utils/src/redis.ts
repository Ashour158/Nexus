import { Redis, RedisOptions } from 'ioredis';

export interface CreateRedisClientOptions {
  db?: number;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
}

export function createRedisClient(
  opts: CreateRedisClientOptions & Omit<RedisOptions, 'sentinels' | 'name'> = {}
): Redis {
  const { db, maxRetriesPerRequest, enableReadyCheck, ...rest } = opts;

  const baseOptions: RedisOptions = {
    db,
    maxRetriesPerRequest,
    enableReadyCheck,
    ...rest,
  };

  const sentinelHosts = process.env.REDIS_SENTINEL_HOSTS;
  if (sentinelHosts) {
    const sentinels = sentinelHosts.split(',').map((host) => {
      const [h, p] = host.trim().split(':');
      return { host: h, port: Number(p) || 26379 };
    });
    return new Redis({
      ...baseOptions,
      sentinels,
      name: 'mymaster',
    });
  }

  return new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', baseOptions);
}

export { Redis };
