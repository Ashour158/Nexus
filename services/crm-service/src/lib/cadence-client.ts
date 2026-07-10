/**
 * Client for the standalone cadence-service internal auto-enroll API.
 *
 * `POST /api/v1/internal/cadence/auto-enroll` evaluates the tenant's cadence
 * enrollment triggers (e.g. `lead.created`) and enrolls the entity into any
 * matching sequences. It is invoked fire-and-forget after a lead is committed.
 *
 * Enrichment-only and STRICTLY FAIL-OPEN: a cadence-service outage, timeout, or
 * non-2xx must never fail or roll back the originating lead write. This module
 * therefore NEVER throws — it returns `null` on any error and logs a warn.
 *
 * Follows the blueprint-client pattern: `createHttpClient` carries the timeout
 * (enforced by `withTimeout` in the resilience layer). When `CADENCE_SERVICE_URL`
 * is unset the client is disabled and callers skip the network hop entirely.
 */
import { createHttpClient } from '@nexus/service-utils';

const BASE_URL = (process.env.CADENCE_SERVICE_URL ?? '').replace(/\/$/, '');
const TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';

// In-cluster default is http://cadence-service:3018 (see docker-compose.yml),
// but we intentionally do NOT hardcode it: auto-enroll stays disabled until the
// orchestrator wires CADENCE_SERVICE_URL, so unconfigured environments never
// emit failing cross-service calls on every lead create.
const client =
  BASE_URL.length > 0
    ? createHttpClient({
        baseURL: BASE_URL,
        headers: { 'x-service-token': TOKEN },
        maxRetries: 1,
        timeoutMs: 4_000,
      })
    : null;

/** True when CADENCE_SERVICE_URL is configured and auto-enroll should be attempted. */
export function isCadenceEnrollEnabled(): boolean {
  return client !== null;
}

export type CadenceObjectType = 'LEAD' | 'CONTACT';

export interface CadenceAutoEnrollEntity {
  objectType: CadenceObjectType;
  objectId: string;
  ownerId?: string | null;
}

export interface CadenceAutoEnrollResult {
  enrolledCadenceIds: string[];
  skipped?: boolean;
}

/**
 * Asks cadence-service to auto-enroll an entity for a given trigger. Returns the
 * result, or `null` when the service is unconfigured/unreachable. NEVER throws.
 */
export async function autoEnrollCadence(
  tenantId: string,
  trigger: string,
  entity: CadenceAutoEnrollEntity
): Promise<CadenceAutoEnrollResult | null> {
  if (!client) return null;
  try {
    const res = await client.post<{ success: boolean; data?: CadenceAutoEnrollResult }>(
      '/api/v1/internal/cadence/auto-enroll',
      { tenantId, trigger, entity },
      { 'x-tenant-id': tenantId }
    );
    if (!res?.success || !res.data) return null;
    return res.data;
  } catch (err) {
    console.warn('[cadence-client] auto-enroll failed; continuing', err);
    return null;
  }
}
