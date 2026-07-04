import { randomUUID } from 'node:crypto';
import { TOPICS, type NexusProducer } from '@nexus/kafka';

/**
 * Shape of an audit event on the unified compliance stream (`nexus.compliance.audit`,
 * a.k.a. `TOPICS.AUDIT`). This mirrors the `AuditEvent` interface exported by
 * `@nexus/audit` and, crucially, the exact fields that `services/audit-consumer`
 * reads and persists into the central `auditLog` table:
 *   id, timestamp, action, resource, resourceId, actorId, actorType, tenantId,
 *   changes?, metadata?, ipAddress?, userAgent?
 *
 * We intentionally re-declare it locally (rather than importing `@nexus/audit`)
 * because auth-service does not depend on that package, and we must not add a
 * dependency. The wire format is plain JSON, so structural compatibility is all
 * that matters — the consumer never imports auth-service's types.
 */
export interface UnifiedAuditEvent {
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

/** Input accepted by the emit helper; sensible defaults are filled in. */
export interface UnifiedAuditInput {
  tenantId: string;
  actorId: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  actorType?: UnifiedAuditEvent['actorType'];
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string;
}

/**
 * Best-effort logger that forwards governance/admin mutations to the unified
 * audit stream (`TOPICS.AUDIT`) so they land in the central audit trail
 * alongside crm-service, deals-service and finance-service.
 *
 * It reuses auth-service's already-connected `NexusProducer` (no separate Kafka
 * connection, no new dependency). Every emit is guarded: a Kafka failure is
 * swallowed and never propagates to the caller. The local `prisma.auditLog`
 * write remains the source of truth if the stream is down.
 */
export class UnifiedAuditLogger {
  constructor(private readonly producer: NexusProducer) {}

  private build(input: UnifiedAuditInput): UnifiedAuditEvent {
    return {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? '',
      actorId: input.actorId,
      actorType: input.actorType ?? 'user',
      tenantId: input.tenantId,
      changes: input.changes,
      metadata: input.metadata,
      ipAddress: input.ipAddress ?? undefined,
      userAgent: input.userAgent ?? undefined,
      correlationId: input.correlationId,
    };
  }

  /**
   * Emit an audit event. Fire-and-forget and fully guarded — resolves even if
   * the publish fails, and never throws. Safe to `void` at call sites.
   */
  async log(input: UnifiedAuditInput): Promise<void> {
    let event: UnifiedAuditEvent;
    try {
      event = this.build(input);
    } catch {
      return; // never let event construction break a mutation
    }
    try {
      // NexusProducer.publish requires `type` + `tenantId`; the remaining
      // AuditEvent fields are spread onto the JSON payload the consumer reads.
      await this.producer.publish(TOPICS.AUDIT, {
        ...event,
        type: 'auth.governance.audited',
        // `event` already carries tenantId and correlationId, which
        // NexusProducer.publish reads for partitioning + headers.
      });
    } catch (err) {
      // Best-effort: the local DB audit write is the source of truth.
      console.warn(
        '[unified-audit] failed to publish audit event; continuing',
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}
