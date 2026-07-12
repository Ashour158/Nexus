import type { Server } from 'socket.io';
import { moduleRecordRoom, moduleRoom } from './rooms.js';

/**
 * The set of CRM domain modules whose events are fanned out to connected
 * WebSocket clients. Used to validate generic `subscribe`/`unsubscribe`
 * requests and to tag every outbound envelope with its `module`.
 */
export const MODULES = [
  'deals',
  'leads',
  'accounts',
  'contacts',
  'activities',
  'quotes',
  'notifications',
] as const;

export type ModuleName = (typeof MODULES)[number];

const MODULE_SET = new Set<string>(MODULES);

export function isModule(value: unknown): value is ModuleName {
  return typeof value === 'string' && MODULE_SET.has(value);
}

/** The raw domain event as delivered by a Kafka consumer handler. */
export interface DomainEvent {
  type: string;
  tenantId?: string;
  payload?: unknown;
}

/**
 * Consistent envelope every realtime consumer emits so the web client can
 * pattern-match a single shape regardless of module or event type.
 */
export interface RealtimeEnvelope {
  type: string;
  tenantId: string;
  module: ModuleName;
  recordId?: string;
  payload: Record<string, unknown>;
  ts: string;
}

/**
 * Build the consistent envelope for a domain event.
 *
 * Returns `null` when the event carries no `tenantId` — such events are dropped
 * rather than fanned out, so a malformed message can never leak to clients of
 * another (or no) tenant.
 */
export function buildEnvelope(
  module: ModuleName,
  event: DomainEvent,
  recordId?: string
): RealtimeEnvelope | null {
  const tenantId = typeof event.tenantId === 'string' ? event.tenantId : '';
  if (!tenantId) return null;
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const envelope: RealtimeEnvelope = {
    type: event.type,
    tenantId,
    module,
    payload,
    ts: new Date().toISOString(),
  };
  if (recordId) envelope.recordId = recordId;
  return envelope;
}

/**
 * Fan an envelope out on the canonical `<module>:event` channel to the
 * tenant-scoped module list room and, when the envelope names a record, the
 * tenant-scoped record room. This is the uniform stream that generic
 * `subscribe({ module })` / `subscribe({ module, recordId })` clients receive.
 *
 * Fail-open: any emit failure is swallowed so a dead socket or a bad payload
 * can never crash the consumer loop. Socket.IO removes disconnected sockets
 * from their rooms automatically, so no manual registry cleanup is needed.
 */
export function emitEnvelope(io: Server, envelope: RealtimeEnvelope | null): void {
  if (!envelope) return;
  try {
    const channel = `${envelope.module}:event`;
    io.to(moduleRoom(envelope.tenantId, envelope.module)).emit(channel, envelope);
    if (envelope.recordId) {
      io.to(moduleRecordRoom(envelope.tenantId, envelope.module, envelope.recordId)).emit(
        channel,
        envelope
      );
    }
  } catch {
    // Never let a fan-out failure crash the consumer.
  }
}
