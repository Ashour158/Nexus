#!/usr/bin/env tsx
/**
 * Simple load test script using fetch.
 */
const TARGET_URL = process.env.TARGET_URL ?? 'http://localhost:3001/health';
const CONCURRENT = Number(process.env.CONCURRENT ?? 10);
const DURATION_SECONDS = Number(process.env.DURATION_SECONDS ?? 30);

interface Result {
  status: number;
  duration: number;
  error?: string;
}

async function runRequest(): Promise<Result> {
  const start = Date.now();
  try {
    const res = await fetch(TARGET_URL, { signal: AbortSignal.timeout(5000) });
    return { status: res.status, duration: Date.now() - start };
  } catch (err) {
    return { status: 0, duration: Date.now() - start, error: (err as Error).message };
  }
}

async function worker(results: Result[]): Promise<void> {
  const endTime = Date.now() + DURATION_SECONDS * 1000;
  while (Date.now() < endTime) {
    results.push(await runRequest());
  }
}

async function main(): Promise<void> {
  console.log(`=== Load Test ===`);
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Concurrent: ${CONCURRENT}`);
  console.log(`Duration: ${DURATION_SECONDS}s\n`);

  const results: Result[] = [];
  const workers = Array.from({ length: CONCURRENT }, () => worker(results));
  await Promise.all(workers);

  const success = results.filter((r) => r.status >= 200 && r.status < 300);
  const errors = results.filter((r) => r.status >= 400 || r.error);
  const durations = results.map((r) => r.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const maxDuration = Math.max(...durations);
  const minDuration = Math.min(...durations);

  console.log(`Total requests: ${results.length}`);
  console.log(`Success: ${success.length} (${((success.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Avg duration: ${avgDuration.toFixed(0)}ms`);
  console.log(`Min duration: ${minDuration}ms`);
  console.log(`Max duration: ${maxDuration}ms`);
}

main().catch(console.error);
