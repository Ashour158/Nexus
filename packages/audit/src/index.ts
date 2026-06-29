/**
 * Audit Log Pipeline — Publish audit events to Kafka for downstream processing.
 */

import { Kafka, type Producer } from 'kafkajs';
import { randomUUID } from 'node:crypto';

export interface AuditEvent {
  id: string;
  timestamp: string;
  action: string;
  resource: string;
  resourceId: string;
  actorId: string;
  actorType: 'user' | 'service' | 'system';
  tenantId: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}

export const AUDIT_TOPIC = 'nexus.compliance.audit';
export type AuditStrictness = 'warn' | 'strict';

const OPERATION_STRICTNESS_ENV: Record<string, string> = {
  'cpq.transition.reconcile': 'AUDIT_STRICTNESS_CPQ_RECONCILE',
  'quoteProjection.replay': 'AUDIT_STRICTNESS_QUOTE_PROJECTION_REPLAY',
  'financeTimeline.replay': 'AUDIT_STRICTNESS_FINANCE_TIMELINE_REPLAY',
};

export interface InternalOperationAuditInput {
  tenantId: string | null | undefined;
  operatorId: string | null | undefined;
  operationType: string;
  operationId: string;
  dryRun?: boolean;
  executed?: boolean;
  reason?: string;
  filters?: Record<string, unknown>;
  counts?: Record<string, unknown>;
  status?: string;
  warnings?: unknown[];
  errors?: unknown[];
  correlationId?: string | null;
  startedAt?: string;
  completedAt?: string;
  sourceService: string;
  targetProjection?: string;
  targetDomain?: string;
  sourceEventIds?: string[];
  [key: string]: unknown;
}

type AuditProducer = {
  publish(topic: string, event: Record<string, unknown>): Promise<void>;
};

export class AuditRequiredError extends Error {
  code = 'AUDIT_REQUIRED_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'AuditRequiredError';
  }
}

export interface InternalOperationAuditPublishResult {
  published: boolean;
  strictness: AuditStrictness;
  event?: AuditEvent;
  warning?: string;
}

function stringArray(values: unknown[] | undefined): string[] {
  return (values ?? []).filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function actorTypeFor(operatorId: string): AuditEvent['actorType'] {
  return operatorId === 'system' ? 'system' : 'service';
}

function normalizeStrictness(
  value: string | undefined,
  source: string,
  warn: (message: string) => void
): AuditStrictness | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'warn' || normalized === 'strict') return normalized;
  warn(`Invalid ${source}="${value}". Falling back to warn audit strictness.`);
  return 'warn';
}

export function resolveAuditStrictness(
  operationType: string,
  env: Record<string, string | undefined> = process.env,
  warn: (message: string) => void = (message) => console.warn(message)
): AuditStrictness {
  const operationEnvKey = OPERATION_STRICTNESS_ENV[operationType];
  const operationValue = operationEnvKey
    ? normalizeStrictness(env[operationEnvKey], operationEnvKey, warn)
    : null;
  if (operationValue) return operationValue;

  const defaultValue = normalizeStrictness(env.AUDIT_STRICTNESS_DEFAULT, 'AUDIT_STRICTNESS_DEFAULT', warn);
  return defaultValue ?? 'warn';
}

export function createInternalOperationAuditEvent(input: InternalOperationAuditInput): AuditEvent {
  const actorId = input.operatorId && input.operatorId.trim().length > 0 ? input.operatorId : 'system';
  const metadata: Record<string, unknown> = {
    operationType: input.operationType,
    operationId: input.operationId,
    dryRun: input.dryRun ?? false,
    executed: input.executed ?? false,
    reason: input.reason ?? null,
    filters: input.filters ?? {},
    counts: input.counts ?? {},
    status: input.status ?? 'unknown',
    warnings: stringArray(input.warnings),
    errors: stringArray(input.errors),
    correlationId: input.correlationId ?? null,
    startedAt: input.startedAt ?? null,
    completedAt: input.completedAt ?? null,
    sourceService: input.sourceService,
    targetProjection: input.targetProjection ?? null,
    targetDomain: input.targetDomain ?? null,
    sourceEventIds: stringArray(input.sourceEventIds),
  };

  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    action: input.operationType,
    resource: 'internal_operation',
    resourceId: input.operationId,
    actorId,
    actorType: actorTypeFor(actorId),
    tenantId: input.tenantId && input.tenantId.trim().length > 0 ? input.tenantId : 'system',
    metadata,
    correlationId: input.correlationId ?? undefined,
  } as AuditEvent;
}

export async function publishInternalOperationAudit(
  producer: AuditProducer,
  input: InternalOperationAuditInput
): Promise<AuditEvent> {
  const event = createInternalOperationAuditEvent(input);
  await producer.publish(AUDIT_TOPIC, {
    type: 'internal.operation.audited',
    correlationId: input.correlationId ?? undefined,
    ...event,
  });
  return event;
}

export async function publishInternalOperationAuditWithPolicy(
  producer: AuditProducer,
  input: InternalOperationAuditInput,
  options?: { strictness?: AuditStrictness }
): Promise<InternalOperationAuditPublishResult> {
  const strictness = options?.strictness ?? resolveAuditStrictness(input.operationType);
  try {
    const event = await publishInternalOperationAudit(producer, input);
    return { published: true, strictness, event };
  } catch (error) {
    const warning = `Audit publish failed: ${error instanceof Error ? error.message : String(error)}`;
    if (strictness === 'strict') {
      throw new AuditRequiredError(warning);
    }
    return { published: false, strictness, warning };
  }
}

export class AuditLogger {
  private producer: Producer;
  private topic: string;

  constructor(kafka: Kafka, topic = 'audit.events') {
    this.producer = kafka.producer();
    this.topic = topic;
  }

  async connect(): Promise<void> {
    await this.producer.connect();
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }

  async log(event: AuditEvent): Promise<void> {
    await this.producer.send({
      topic: this.topic,
      messages: [
        {
          key: event.tenantId,
          value: JSON.stringify(event),
          headers: {
            'x-actor-id': event.actorId,
            'x-tenant-id': event.tenantId,
            'x-action': event.action,
          },
        },
      ],
    });
  }
}

/** Fastify hook that logs HTTP requests as audit events. */
export function auditHook(auditLogger: AuditLogger) {
  return async (request: Record<string, unknown>, reply: Record<string, unknown>) => {
    const event: AuditEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: `${request.method}_${request.url}`,
      resource: (request.url as string).split('/')[1] ?? 'unknown',
      resourceId: (request.params as Record<string, string> | undefined)?.id ?? '',
      actorId: (request.user as Record<string, string> | undefined)?.id ?? 'anonymous',
      actorType: 'user',
      tenantId: (request.headers as Record<string, string>)?.['x-tenant-id'] ?? 'system',
      ipAddress: (request as Record<string, unknown>).ip as string ?? '',
      userAgent: (request.headers as Record<string, string>)?.['user-agent'] ?? '',
    };

    try {
      await auditLogger.log(event);
    } catch (err) {
      console.error('Audit log failed:', (err as Error).message);
    }
  };
}
