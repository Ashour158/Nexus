import Fastify from 'fastify';
import { Registry } from 'prom-client';
import { describe, expect, it } from 'vitest';
import { EffectProbeRegistry } from '../effect-probes.js';
import { registerHealthRoutes } from '../health.js';

const thresholds = {
  staleWarnSeconds: 10,
  staleFailSeconds: 20,
  zeroOutputWarnIntervals: 1,
  zeroOutputFailIntervals: 2,
  outboxPendingWarn: 2,
  outboxPendingFail: 4,
  outboxOldestWarnSeconds: 10,
  outboxOldestFailSeconds: 20,
  dlqDepthWarn: 2,
  dlqDepthFail: 4,
  dlqOldestObservedWarnSeconds: 10,
  dlqOldestObservedFailSeconds: 20,
};

function fixture(now = 100_000) {
  let clock = now;
  const registry = new Registry();
  const probes = new EffectProbeRegistry('svc', {
    thresholds,
    now: () => clock,
    prometheusRegistry: registry,
    samplerMinIntervalMs: 0,
  });
  return { probes, registry, advance: (ms: number) => { clock += ms; } };
}

describe('EffectProbeRegistry', () => {
  it('distinguishes idle from demanded zero-output intervals and applies warn/fail thresholds', () => {
    const { probes } = fixture();
    probes.recordInterval('engine', 0, 0);
    expect(probes.evaluate()[0]).toMatchObject({ status: 'pass', message: 'idle interval; no output demand' });
    probes.recordInterval('engine', 3, 0);
    expect(probes.evaluate()[0].status).toBe('warn');
    probes.recordInterval('engine', 1, 0);
    expect(probes.evaluate()[0].status).toBe('fail');
  });

  it('records healthy committed output and its timestamp', async () => {
    const { probes, registry } = fixture();
    probes.recordInterval('engine', 3, 3);
    expect(probes.evaluate()[0].status).toBe('pass');
    expect(await registry.getSingleMetricAsString('nexus_effect_last_successful_output_timestamp_seconds')).toContain(' 100');
  });

  it('fails stale observations at the configured threshold', () => {
    const { probes, advance } = fixture();
    probes.recordInterval('engine', 0, 0);
    advance(21_000);
    expect(probes.evaluate()[0]).toMatchObject({ status: 'fail', observationAgeSeconds: 21 });
  });

  it('uses the exact oldest PENDING timestamp and backlog thresholds', () => {
    const { probes } = fixture();
    probes.recordInterval('engine', 0, 0);
    probes.recordBacklog('engine', { outboxPendingCount: 3, outboxOldestPendingAt: new Date(85_000) });
    const result = probes.evaluate()[0];
    expect(result.status).toBe('warn');
    expect(result.message).toContain('oldest PENDING age seconds 15');
  });

  it('tracks DLQ backlog first-observed age and resets it at depth zero', () => {
    const { probes, advance } = fixture();
    probes.recordInterval('dlq', 0, 0);
    probes.recordBacklog('dlq', { dlqDepth: 1 });
    advance(11_000);
    expect(probes.evaluate()[0].message).toContain('DLQ backlog first-observed age seconds 11');
    probes.recordBacklog('dlq', { dlqDepth: 0 });
    expect(probes.evaluate()[0].status).toBe('pass');
  });

  it('reports sampler failures instead of replacing them with healthy zeroes', async () => {
    const { probes, registry } = fixture();
    probes.registerEngine('engine', async () => { throw new Error('database unavailable'); });
    await probes.refresh(true);
    expect(probes.evaluate()[0]).toMatchObject({ status: 'fail' });
    expect(probes.evaluate()[0].message).toContain('database unavailable');
    expect(await registry.getSingleMetricAsString('nexus_effect_probe_sampler_failures_total')).toContain(' 1');
  });

  it('recovers an interval failure after a successful interval without a backlog sample', () => {
    const { probes } = fixture();
    probes.recordIntervalFailure('engine', new Error('poll failed'));
    expect(probes.evaluate()[0]).toMatchObject({ status: 'fail' });
    probes.recordInterval('engine', 0, 0);
    expect(probes.evaluate()[0]).toMatchObject({ status: 'pass', message: 'idle interval; no output demand' });
  });

  it('keeps a sampler failure visible after a successful interval', () => {
    const { probes } = fixture();
    probes.recordSamplerFailure('engine', new Error('sampler failed'));
    probes.recordInterval('engine', 0, 0);
    expect(probes.evaluate()[0]).toMatchObject({ status: 'fail' });
    expect(probes.evaluate()[0].message).toContain('sampler failed');
  });

  it('recovers a sampler failure with a backlog sample without clearing an interval failure', () => {
    const { probes } = fixture();
    probes.recordSamplerFailure('engine', new Error('sampler failed'));
    probes.recordIntervalFailure('engine', new Error('poll failed'));
    probes.recordBacklog('engine', { outboxPendingCount: 0 });
    const result = probes.evaluate()[0];
    expect(result).toMatchObject({ status: 'fail' });
    expect(result.message).toContain('poll failed');
    expect(result.message).not.toContain('sampler failed');
  });

  it('exposes monotonic failure counters for both independent channels', async () => {
    const { probes, registry } = fixture();
    probes.recordSamplerFailure('engine', new Error('sampler failed'));
    probes.recordIntervalFailure('engine', new Error('poll failed'));
    const metrics = await registry.metrics();
    expect(metrics).toContain('nexus_effect_probe_sampler_failures_total{service="svc",engine="engine"} 1');
    expect(metrics).toContain('nexus_effect_probe_interval_failures_total{service="svc",engine="engine"} 1');
  });

  it('exposes stable low-cardinality Prometheus gauges', async () => {
    const { probes, registry } = fixture();
    probes.recordInterval('engine', 2, 1);
    probes.recordBacklog('engine', { outboxPendingCount: 1, outboxOldestPendingAt: new Date(99_000), dlqDepth: 0 });
    probes.evaluate();
    const metrics = await registry.metrics();
    expect(metrics).toContain('nexus_effect_consumer_input_last_interval{service="svc",engine="engine"} 2');
    expect(metrics).toContain('nexus_effect_rows_written_last_interval{service="svc",engine="engine"} 1');
    expect(metrics).toContain('nexus_effect_outbox_oldest_pending_age_seconds{service="svc",engine="engine"} 1');
    expect(metrics).toContain('nexus_effect_dlq_depth{service="svc",engine="engine"} 0');
    expect(metrics).not.toContain('consumer_lag');
  });
});

describe('registerHealthRoutes effect-probe compatibility', () => {
  it('preserves three-argument behavior', async () => {
    const app = Fastify();
    registerHealthRoutes(app, 'legacy', [async () => ({ name: 'db', ok: true })]);
    const response = await app.inject('/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'healthy', checks: [{ name: 'db', status: 'pass' }] });
    await app.close();
  });

  it('keeps warnings HTTP 200 but makes failures HTTP 503', async () => {
    const warn = fixture().probes;
    warn.recordInterval('engine', 1, 0);
    const warnApp = Fastify();
    registerHealthRoutes(warnApp, 'svc', [], warn);
    const warning = await warnApp.inject('/health');
    expect(warning.statusCode).toBe(200);
    expect(warning.json()).toMatchObject({ status: 'degraded', checks: [{ status: 'warn' }] });
    await warnApp.close();

    const fail = fixture().probes;
    fail.recordInterval('engine', 1, 0);
    fail.recordInterval('engine', 1, 0);
    const failApp = Fastify();
    registerHealthRoutes(failApp, 'svc', [], fail);
    expect((await failApp.inject('/health')).statusCode).toBe(503);
    await failApp.close();
  });
});
