/**
 * OpenTelemetry distributed tracing for NEXUS services.
 *
 * Usage:
 *   import { startTracing, getTracer, withSpan } from '@nexus/service-utils/tracing';
 *   startTracing('crm-service');
 *
 *   const result = await withSpan('process-deal', async (span) => {
 *     span.setAttribute('deal.id', dealId);
 *     return await processDeal(dealId);
 *   });
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import {
  trace,
  type Tracer,
  type Span,
  type Context,
  context,
  SpanStatusCode,
} from '@opentelemetry/api';
import { AsyncLocalStorage } from 'node:async_hooks';

const traceContextStore = new AsyncLocalStorage<Record<string, string>>();

export function runWithTraceContext(headers: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  return traceContextStore.run(headers, fn);
}

export function getTraceContext(): Record<string, string> {
  return traceContextStore.getStore() ?? {};
}
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

// Instrumentations
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';

let sdk: NodeSDK | null = null;
let activeTracer: Tracer | null = null;

export interface TracingOptions {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  endpoint?: string;
  /** Sampling ratio: 0.0 to 1.0 */
  samplingRatio?: number;
}

export function startTracing(opts: TracingOptions): void {
  if (sdk) return; // Already initialised

  const {
    serviceName,
    serviceVersion = '1.0.0',
    environment = process.env.NODE_ENV ?? 'development',
    endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4317',
    samplingRatio = environment === 'production' ? 0.1 : 1.0,
  } = opts;

  const exporter = new OTLPTraceExporter({ url: endpoint });

  sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'nexus',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
    }),
    traceExporter: exporter,
    spanProcessor: new BatchSpanProcessor(exporter),
    contextManager: new AsyncLocalStorageContextManager(),
    instrumentations: [
      new HttpInstrumentation(),
      new FastifyInstrumentation(),
    ],
    sampler: {
      shouldSample: () => ({
        decision: Math.random() < samplingRatio ? 1 : 0,
        attributes: {},
      }),
      toString: () => `TraceIdRatioBased{${samplingRatio}}`,
    } as any,
  });

  sdk.start();
  activeTracer = trace.getTracer(serviceName, serviceVersion);

  // Graceful shutdown
  process.on('SIGTERM', () => sdk?.shutdown());
  process.on('SIGINT', () => sdk?.shutdown());
}

export function getTracer(name?: string): Tracer {
  if (!activeTracer) {
    throw new Error('Tracing not initialised. Call startTracing() first.');
  }
  return name ? trace.getTracer(name) : activeTracer;
}

export async function withSpan<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
  parentContext?: Context
): Promise<T> {
  const tracer = getTracer();
  const ctx = parentContext ?? context.active();
  const span = tracer.startSpan(spanName, undefined, ctx);

  try {
    const result = await context.with(trace.setSpan(ctx, span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
    throw err;
  } finally {
    span.end();
  }
}

export function getActiveSpan(): Span | undefined {
  return trace.getSpan(context.active());
}

export function setSpanAttribute(key: string, value: unknown): void {
  getActiveSpan()?.setAttribute(key, value as any);
}

/** Extract traceparent header from active context for outbound propagation. */
export function getTraceparentHeader(): Record<string, string> {
  const propagator = trace.getSpan(context.active());
  if (!propagator) return {};
  // W3C traceparent format: 00-{traceId}-{spanId}-01
  const spanContext = propagator.spanContext();
  if (!spanContext || !spanContext.traceId || !spanContext.spanId) return {};
  return {
    traceparent: `00-${spanContext.traceId}-${spanContext.spanId}-01`,
  };
}
