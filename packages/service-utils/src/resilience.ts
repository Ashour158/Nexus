/**
 * Resilience primitives: Circuit Breaker, Exponential Backoff Retry, and Timeout.
 *
 * Usage:
 *   const result = await withResilience(() => fetchExternalAPI(), {
 *     maxRetries: 3,
 *     timeoutMs: 10_000,
 *     circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30_000 },
 *   });
 */

import { NexusError } from './errors.js';

/* ─── Timeout ─────────────────────────────────────────────────────────────── */

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new NexusError('TIMEOUT', `Operation timed out after ${timeoutMs}ms`, 504));
    }, timeoutMs);
    promise
      .then((val) => { clearTimeout(timer); resolve(val); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

/* ─── Exponential Backoff Retry ───────────────────────────────────────────── */

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  retryable?: (err: unknown) => boolean;
}

function isRetryableDefault(err: unknown): boolean {
  if (err instanceof NexusError) {
    return err.statusCode >= 500 || err.code === 'TIMEOUT' || err.code === 'NETWORK_ERROR';
  }
  if (err instanceof Error) {
    return /fetch|network|timeout|ECONNRESET|ETIMEDOUT/i.test(err.message);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 200,
    maxDelayMs = 10_000,
    jitter = true,
    retryable = isRetryableDefault,
  } = opts;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries || !retryable(err)) throw err;
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const jittered = jitter ? delay * (0.5 + Math.random() * 0.5) : delay;
      await sleep(jittered);
    }
  }
  throw lastError;
}

/* ─── Circuit Breaker ─────────────────────────────────────────────────────── */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxCalls?: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private nextAttempt = 0;
  private halfOpenCalls = 0;

  constructor(
    private readonly name: string,
    private readonly opts: CircuitBreakerOptions = {}
  ) {
    this.opts = {
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      halfOpenMaxCalls: 3,
      ...opts,
    };
  }

  getState(): CircuitState {
    if (this.state === 'OPEN' && Date.now() >= this.nextAttempt) {
      this.state = 'HALF_OPEN';
      this.halfOpenCalls = 0;
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();
    if (state === 'OPEN') {
      throw new NexusError(
        'CIRCUIT_OPEN',
        `Circuit breaker '${this.name}' is OPEN`,
        503
      );
    }
    if (state === 'HALF_OPEN') {
      if (this.halfOpenCalls >= (this.opts.halfOpenMaxCalls ?? 3)) {
        throw new NexusError(
          'CIRCUIT_OPEN',
          `Circuit breaker '${this.name}' is OPEN (half-open limit reached)`,
          503
        );
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.halfOpenCalls = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    if (this.failures >= (this.opts.failureThreshold ?? 5)) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + (this.opts.resetTimeoutMs ?? 30_000);
    }
  }
}

/* ─── Combined Resilience Wrapper ─────────────────────────────────────────── */

export interface ResilienceOptions {
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  retryable?: (err: unknown) => boolean;
  circuitBreaker?: CircuitBreakerOptions | boolean;
  /** Unique name for the circuit breaker instance. Required when circuitBreaker is enabled to avoid sharing state across unrelated operations. */
  circuitBreakerName?: string;
}

export async function withResilience<T>(
  fn: () => Promise<T>,
  opts: ResilienceOptions = {}
): Promise<T> {
  const { timeoutMs, maxRetries = 0, circuitBreaker, ...retryOpts } = opts;

  let operation = fn;

  if (maxRetries > 0) {
    const wrapped = operation;
    operation = () => withRetry(wrapped, { maxRetries, ...retryOpts });
  }

  if (timeoutMs && timeoutMs > 0) {
    const wrapped = operation;
    operation = () => withTimeout(wrapped(), timeoutMs);
  }

  if (circuitBreaker) {
    const cbOpts = circuitBreaker === true ? {} : circuitBreaker;
    // Use a named circuit breaker so unrelated operations do not share state.
    // IMPORTANT: Always provide circuitBreakerName to avoid sharing state across
    // unrelated operations. If omitted, we derive a name from the call stack.
    const cbName = opts.circuitBreakerName ?? deriveCircuitBreakerName();
    const cb = getGlobalCircuitBreaker(cbName, cbOpts);
    const wrapped = operation;
    operation = () => cb.execute(wrapped);
  }

  return operation();
}

const globalCircuitBreakers = new Map<string, CircuitBreaker>();

function getGlobalCircuitBreaker(name: string, opts: CircuitBreakerOptions): CircuitBreaker {
  if (!globalCircuitBreakers.has(name)) {
    globalCircuitBreakers.set(name, new CircuitBreaker(name, opts));
  }
  return globalCircuitBreakers.get(name)!;
}

/** Derive a unique-enough circuit breaker name from the call stack to avoid
 *  collapsing unrelated operations into the same breaker when the caller
 *  forgets to set `circuitBreakerName`.
 */
function deriveCircuitBreakerName(): string {
  const stack = new Error().stack ?? '';
  const lines = stack.split('\n').slice(3, 6);
  const hash = lines.join('|').replace(/\s+/g, '').slice(0, 64);
  return `auto:${hash}`;
}
