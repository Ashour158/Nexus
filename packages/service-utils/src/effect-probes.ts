import { Gauge, Counter, register as defaultRegistry, type Registry } from 'prom-client';

export type EffectProbeStatus = 'pass' | 'warn' | 'fail';

export interface EffectProbeThresholds {
  staleWarnSeconds: number;
  staleFailSeconds: number;
  zeroOutputWarnIntervals: number;
  zeroOutputFailIntervals: number;
  outboxPendingWarn: number;
  outboxPendingFail: number;
  outboxOldestWarnSeconds: number;
  outboxOldestFailSeconds: number;
  dlqDepthWarn: number;
  dlqDepthFail: number;
  dlqOldestObservedWarnSeconds: number;
  dlqOldestObservedFailSeconds: number;
}

export const conservativeEffectProbeThresholds: EffectProbeThresholds = {
  staleWarnSeconds: 120,
  staleFailSeconds: 600,
  zeroOutputWarnIntervals: 1,
  zeroOutputFailIntervals: 3,
  outboxPendingWarn: 100,
  outboxPendingFail: 1000,
  outboxOldestWarnSeconds: 300,
  outboxOldestFailSeconds: 1800,
  dlqDepthWarn: 1,
  dlqDepthFail: 100,
  dlqOldestObservedWarnSeconds: 900,
  dlqOldestObservedFailSeconds: 3600,
};

export interface EffectBacklogSample {
  outboxPendingCount?: number;
  outboxOldestPendingAt?: Date | null;
  dlqDepth?: number;
}

export type EffectProbeSampler = () => Promise<EffectBacklogSample>;

interface EngineState {
  input: number;
  rowsWritten: number;
  intervalObservedAt?: number;
  lastSuccessfulOutputAt?: number;
  consecutiveZeroOutput: number;
  outboxPendingCount?: number;
  outboxOldestPendingAt?: number;
  dlqDepth?: number;
  dlqBacklogFirstObservedAt?: number;
  sampleObservedAt?: number;
  samplerFailedAt?: number;
  samplerError?: string;
  intervalFailedAt?: number;
  intervalError?: string;
}

export interface EffectProbeEvaluation {
  service: string;
  engine: string;
  status: EffectProbeStatus;
  message: string;
  inputLastInterval: number;
  rowsWrittenLastInterval: number;
  observationAgeSeconds?: number;
}

export interface EffectProbeRegistryOptions {
  thresholds?: Partial<EffectProbeThresholds>;
  samplerMinIntervalMs?: number;
  now?: () => number;
  prometheusRegistry?: Registry;
}

const metricNames = {
  input: 'nexus_effect_consumer_input_last_interval',
  output: 'nexus_effect_rows_written_last_interval',
  lastOutput: 'nexus_effect_last_successful_output_timestamp_seconds',
  outboxCount: 'nexus_effect_outbox_pending_count',
  outboxAge: 'nexus_effect_outbox_oldest_pending_age_seconds',
  dlqDepth: 'nexus_effect_dlq_depth',
  dlqAge: 'nexus_effect_dlq_backlog_first_observed_age_seconds',
  observationAge: 'nexus_effect_probe_observation_age_seconds',
  status: 'nexus_effect_probe_status',
  samplerFailures: 'nexus_effect_probe_sampler_failures_total',
  intervalFailures: 'nexus_effect_probe_interval_failures_total',
} as const;

function safeError(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
}

export class EffectProbeRegistry {
  readonly service: string;
  private readonly thresholds: EffectProbeThresholds;
  private readonly samplerMinIntervalMs: number;
  private readonly now: () => number;
  private readonly states = new Map<string, EngineState>();
  private readonly samplers = new Map<string, EffectProbeSampler>();
  private refreshPromise?: Promise<void>;
  private lastRefreshStartedAt = 0;
  private readonly gauges: Record<string, Gauge<string>>;
  private readonly samplerFailures: Counter<string>;
  private readonly intervalFailures: Counter<string>;

  constructor(service: string, options: EffectProbeRegistryOptions = {}) {
    this.service = service;
    this.thresholds = { ...conservativeEffectProbeThresholds, ...options.thresholds };
    this.samplerMinIntervalMs = options.samplerMinIntervalMs ?? 15_000;
    this.now = options.now ?? Date.now;
    const registry = options.prometheusRegistry ?? defaultRegistry;
    const gauge = (name: string, help: string, labels: string[] = ['service', 'engine']) =>
      new Gauge({ name, help, labelNames: labels, registers: [registry] });
    this.gauges = {
      input: gauge(metricNames.input, 'Consumer input/events attempted in the latest completed interval'),
      output: gauge(metricNames.output, 'Rows committed in the latest completed interval'),
      lastOutput: gauge(metricNames.lastOutput, 'Unix timestamp of the last interval with committed output'),
      outboxCount: gauge(metricNames.outboxCount, 'Current PENDING outbox row count'),
      outboxAge: gauge(metricNames.outboxAge, 'Exact age of the oldest PENDING outbox row'),
      dlqDepth: gauge(metricNames.dlqDepth, 'Current DLQ backlog depth (not consumer lag)'),
      dlqAge: gauge(metricNames.dlqAge, 'Age since a nonzero DLQ backlog was first observed; not exact message age'),
      observationAge: gauge(metricNames.observationAge, 'Age of the latest successful effect observation'),
      status: gauge(metricNames.status, 'Effect probe status by state (1 for current state)', ['service', 'engine', 'status']),
    };
    this.samplerFailures = new Counter({
      name: metricNames.samplerFailures,
      help: 'Total effect probe sampler failures',
      labelNames: ['service', 'engine'],
      registers: [registry],
    });
    this.intervalFailures = new Counter({
      name: metricNames.intervalFailures,
      help: 'Total effect probe interval observation failures',
      labelNames: ['service', 'engine'],
      registers: [registry],
    });
  }

  registerEngine(engine: string, sampler?: EffectProbeSampler): void {
    this.state(engine);
    if (sampler) this.samplers.set(engine, sampler);
    this.updateMetrics(engine);
  }

  recordInterval(engine: string, input: number, rowsWritten: number, observedAt = this.now()): void {
    const state = this.state(engine);
    state.input = input;
    state.rowsWritten = rowsWritten;
    state.intervalObservedAt = observedAt;
    state.intervalFailedAt = undefined;
    state.intervalError = undefined;
    state.consecutiveZeroOutput = input > 0 && rowsWritten === 0 ? state.consecutiveZeroOutput + 1 : 0;
    if (rowsWritten > 0) state.lastSuccessfulOutputAt = observedAt;
    this.updateMetrics(engine);
  }

  recordIntervalFailure(engine: string, error: unknown, observedAt = this.now()): void {
    const state = this.state(engine);
    state.intervalFailedAt = observedAt;
    state.intervalError = safeError(error);
    this.intervalFailures.inc({ service: this.service, engine });
    this.updateMetrics(engine);
  }

  recordSamplerFailure(engine: string, error: unknown, observedAt = this.now()): void {
    const state = this.state(engine);
    state.samplerFailedAt = observedAt;
    state.samplerError = safeError(error);
    this.samplerFailures.inc({ service: this.service, engine });
    this.updateMetrics(engine);
  }

  recordBacklog(engine: string, sample: EffectBacklogSample, observedAt = this.now()): void {
    const state = this.state(engine);
    if (sample.outboxPendingCount !== undefined) state.outboxPendingCount = sample.outboxPendingCount;
    if (sample.outboxOldestPendingAt !== undefined) {
      state.outboxOldestPendingAt = sample.outboxOldestPendingAt?.getTime();
    }
    if (sample.dlqDepth !== undefined) {
      state.dlqDepth = sample.dlqDepth;
      if (sample.dlqDepth > 0) state.dlqBacklogFirstObservedAt ??= observedAt;
      else state.dlqBacklogFirstObservedAt = undefined;
    }
    state.sampleObservedAt = observedAt;
    state.samplerFailedAt = undefined;
    state.samplerError = undefined;
    this.updateMetrics(engine);
  }

  async refresh(force = false): Promise<void> {
    const now = this.now();
    if (!force && now - this.lastRefreshStartedAt < this.samplerMinIntervalMs) return this.refreshPromise;
    if (this.refreshPromise) return this.refreshPromise;
    this.lastRefreshStartedAt = now;
    this.refreshPromise = Promise.all([...this.samplers].map(async ([engine, sampler]) => {
      try { this.recordBacklog(engine, await sampler(), this.now()); }
      catch (err) { this.recordSamplerFailure(engine, err, this.now()); }
    })).then(() => undefined).finally(() => { this.refreshPromise = undefined; });
    return this.refreshPromise;
  }

  evaluate(): EffectProbeEvaluation[] {
    return [...this.states.keys()].sort().map((engine) => this.evaluateEngine(engine));
  }

  private state(engine: string): EngineState {
    let state = this.states.get(engine);
    if (!state) {
      state = { input: 0, rowsWritten: 0, consecutiveZeroOutput: 0 };
      this.states.set(engine, state);
    }
    return state;
  }

  private evaluateEngine(engine: string): EffectProbeEvaluation {
    const s = this.state(engine);
    const now = this.now();
    const latestObservation = Math.max(s.intervalObservedAt ?? 0, s.sampleObservedAt ?? 0) || undefined;
    const age = latestObservation === undefined ? undefined : Math.max(0, (now - latestObservation) / 1000);
    const issues: Array<{ status: EffectProbeStatus; message: string }> = [];
    const threshold = (value: number | undefined, warn: number, fail: number, message: string) => {
      if (value === undefined) return;
      if (value >= fail) issues.push({ status: 'fail', message: `${message} ${Math.round(value)} (fail >= ${fail})` });
      else if (value >= warn) issues.push({ status: 'warn', message: `${message} ${Math.round(value)} (warn >= ${warn})` });
    };
    if (s.samplerFailedAt !== undefined && (s.sampleObservedAt === undefined || s.samplerFailedAt >= s.sampleObservedAt)) {
      issues.push({ status: 'fail', message: `sampler failed: ${s.samplerError ?? 'unknown error'}` });
    }
    if (s.intervalFailedAt !== undefined && (s.intervalObservedAt === undefined || s.intervalFailedAt >= s.intervalObservedAt)) {
      issues.push({ status: 'fail', message: `interval observation failed: ${s.intervalError ?? 'unknown error'}` });
    }
    if (latestObservation === undefined) issues.push({ status: 'warn', message: 'awaiting first observation' });
    threshold(age, this.thresholds.staleWarnSeconds, this.thresholds.staleFailSeconds, 'observation age seconds');
    threshold(s.consecutiveZeroOutput, this.thresholds.zeroOutputWarnIntervals, this.thresholds.zeroOutputFailIntervals, 'consecutive demanded intervals with zero output');
    threshold(s.outboxPendingCount, this.thresholds.outboxPendingWarn, this.thresholds.outboxPendingFail, 'outbox PENDING rows');
    const outboxAge = s.outboxOldestPendingAt === undefined ? undefined : Math.max(0, (now - s.outboxOldestPendingAt) / 1000);
    threshold(outboxAge, this.thresholds.outboxOldestWarnSeconds, this.thresholds.outboxOldestFailSeconds, 'oldest PENDING age seconds');
    threshold(s.dlqDepth, this.thresholds.dlqDepthWarn, this.thresholds.dlqDepthFail, 'DLQ depth');
    const dlqAge = s.dlqBacklogFirstObservedAt === undefined ? undefined : Math.max(0, (now - s.dlqBacklogFirstObservedAt) / 1000);
    threshold(dlqAge, this.thresholds.dlqOldestObservedWarnSeconds, this.thresholds.dlqOldestObservedFailSeconds, 'DLQ backlog first-observed age seconds');
    const status = issues.some((i) => i.status === 'fail') ? 'fail' : issues.some((i) => i.status === 'warn') ? 'warn' : 'pass';
    this.updateMetrics(engine, status);
    return { service: this.service, engine, status, message: issues.map((i) => i.message).join('; ') || (s.input === 0 ? 'idle interval; no output demand' : 'effect observations within thresholds'), inputLastInterval: s.input, rowsWrittenLastInterval: s.rowsWritten, observationAgeSeconds: age };
  }

  private updateMetrics(engine: string, evaluatedStatus?: EffectProbeStatus): void {
    const s = this.state(engine);
    const labels = { service: this.service, engine };
    this.gauges.input.set(labels, s.input);
    this.gauges.output.set(labels, s.rowsWritten);
    this.gauges.lastOutput.set(labels, s.lastSuccessfulOutputAt === undefined ? 0 : s.lastSuccessfulOutputAt / 1000);
    if (s.outboxPendingCount !== undefined) this.gauges.outboxCount.set(labels, s.outboxPendingCount);
    if (s.outboxOldestPendingAt !== undefined) this.gauges.outboxAge.set(labels, Math.max(0, (this.now() - s.outboxOldestPendingAt) / 1000));
    else if (s.outboxPendingCount === 0) this.gauges.outboxAge.set(labels, 0);
    if (s.dlqDepth !== undefined) this.gauges.dlqDepth.set(labels, s.dlqDepth);
    if (s.dlqBacklogFirstObservedAt !== undefined) this.gauges.dlqAge.set(labels, Math.max(0, (this.now() - s.dlqBacklogFirstObservedAt) / 1000));
    else if (s.dlqDepth === 0) this.gauges.dlqAge.set(labels, 0);
    const latest = Math.max(s.intervalObservedAt ?? 0, s.sampleObservedAt ?? 0);
    if (latest > 0) this.gauges.observationAge.set(labels, Math.max(0, (this.now() - latest) / 1000));
    if (evaluatedStatus) for (const status of ['pass', 'warn', 'fail'] as const) this.gauges.status.set({ ...labels, status }, status === evaluatedStatus ? 1 : 0);
  }
}

export { metricNames as effectProbeMetricNames };
