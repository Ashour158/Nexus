import { describe, expect, it, vi } from 'vitest';
import { createForecastAnalyticsService } from '../forecast.analytics.js';

describe('forecast percentage contract', () => {
  it('returns winRatePct on the 0-100 scale', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => [{ won: 1, total: 4 }] })
      .mockResolvedValueOnce({ json: async () => [] });
    const service = createForecastAnalyticsService({ query } as never);

    const result = await service.getWeightedPipeline('tenant-1');

    expect(result.winRatePct).toBe(25);
    expect(result.winRate).toBe(25);
    expect(result.forecastByMonth).toEqual([]);
  });
});
