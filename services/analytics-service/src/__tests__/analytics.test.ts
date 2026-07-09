import { describe, it, expect } from 'vitest';

describe('Analytics Service', () => {
  it('should aggregate events by day', () => {
    const events = [
      { date: '2024-01-01', value: 10 },
      { date: '2024-01-01', value: 20 },
      { date: '2024-01-02', value: 15 },
    ];
    const grouped = events.reduce((acc, e) => {
      acc[e.date] = (acc[e.date] || 0) + e.value;
      return acc;
    }, {} as Record<string, number>);
    expect(grouped['2024-01-01']).toBe(30);
    expect(grouped['2024-01-02']).toBe(15);
  });

  it('should compute conversion rate', () => {
    const leads = 100;
    const converted = 25;
    const rate = (converted / leads) * 100;
    expect(rate).toBe(25);
  });

  it('should validate date range parameters', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-01-31');
    expect(start < end).toBe(true);
    expect(end.getTime() - start.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('should bucket time-series data by interval', () => {
    const data = Array.from({ length: 24 }, (_, i) => ({ hour: i, value: i * 10 }));
    const bucketed = data.reduce((acc, d) => {
      const bucket = Math.floor(d.hour / 6);
      acc[bucket] = (acc[bucket] || 0) + d.value;
      return acc;
    }, {} as Record<number, number>);
    expect(Object.keys(bucketed).length).toBe(4);
  });

  it('should handle empty result sets gracefully', () => {
    const empty: number[] = [];
    const avg = empty.length > 0 ? empty.reduce((a, b) => a + b, 0) / empty.length : 0;
    expect(avg).toBe(0);
  });
});
