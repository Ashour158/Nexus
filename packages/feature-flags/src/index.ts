/**
 * Feature Flags — Redis-backed feature flag system with tenant scoping.
 */

import { Redis } from 'ioredis';

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  tenantIds?: string[];
  userIds?: string[];
  rolloutPercentage?: number;
}

export class FeatureFlagService {
  private redis: Redis;
  private prefix = 'feature_flag:';

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379');
  }

  private key(name: string): string {
    return `${this.prefix}${name}`;
  }

  async setFlag(flag: FeatureFlag): Promise<void> {
    await this.redis.set(this.key(flag.name), JSON.stringify(flag));
  }

  async getFlag(name: string): Promise<FeatureFlag | null> {
    const raw = await this.redis.get(this.key(name));
    if (!raw) return null;
    return JSON.parse(raw) as FeatureFlag;
  }

  async isEnabled(name: string, context?: { tenantId?: string; userId?: string }): Promise<boolean> {
    const flag = await this.getFlag(name);
    if (!flag) return false;
    if (!flag.enabled) return false;

    if (flag.tenantIds && context?.tenantId) {
      if (!flag.tenantIds.includes(context.tenantId)) return false;
    }

    if (flag.userIds && context?.userId) {
      if (!flag.userIds.includes(context.userId)) return false;
    }

    if (flag.rolloutPercentage !== undefined && context?.userId) {
      const hash = this.hashString(context.userId + name);
      const percentage = hash % 100;
      return percentage < flag.rolloutPercentage;
    }

    return true;
  }

  async deleteFlag(name: string): Promise<void> {
    await this.redis.del(this.key(name));
  }

  async listFlags(): Promise<FeatureFlag[]> {
    const flags: FeatureFlag[] = [];
    let cursor = '0';
    do {
      const result = await this.redis.scan(cursor, 'MATCH', `${this.prefix}*`, 'COUNT', 100);
      cursor = result[0];
      const keys = result[1];
      if (keys.length > 0) {
        const values = await this.redis.mget(...keys);
        for (const raw of values) {
          if (raw) flags.push(JSON.parse(raw) as FeatureFlag);
        }
      }
    } while (cursor !== '0');
    return flags;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
