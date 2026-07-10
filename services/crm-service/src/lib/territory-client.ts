/**
 * Client for the standalone territory-service internal auto-routing API.
 *
 * `POST /api/v1/internal/territories/assign` is READ-ONLY (it computes the
 * best-matching territory + owner for a lead/deal from the tenant's assignment
 * rules and has no side effects), so it is safe to call inline during a
 * create. Everything here is enrichment-only and STRICTLY FAIL-OPEN: a
 * territory-service outage, timeout, or non-2xx must never fail or roll back the
 * originating lead/deal write. This module therefore NEVER throws — it returns
 * `null` on any error and logs a warn.
 *
 * Follows the blueprint-client pattern: `createHttpClient` carries the timeout
 * (enforced by `withTimeout` in the resilience layer) so a hung territory-service
 * can never hang the create path. When `TERRITORY_SERVICE_URL` is unset the
 * client is disabled and callers skip the network hop entirely.
 */
import { createHttpClient } from '@nexus/service-utils';

const BASE_URL = (process.env.TERRITORY_SERVICE_URL ?? '').replace(/\/$/, '');
const TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? '';

// In-cluster default is http://territory-service:3019 (see docker-compose.yml),
// but we intentionally do NOT hardcode it: routing stays disabled until the
// orchestrator wires TERRITORY_SERVICE_URL, so unconfigured environments never
// emit failing cross-service calls on every lead/deal create.
const client =
  BASE_URL.length > 0
    ? createHttpClient({
        baseURL: BASE_URL,
        headers: { 'x-service-token': TOKEN },
        maxRetries: 1,
        timeoutMs: 4_000,
      })
    : null;

/** True when TERRITORY_SERVICE_URL is configured and routing should be attempted. */
export function isTerritoryRoutingEnabled(): boolean {
  return client !== null;
}

export type TerritoryEntityType = 'lead' | 'deal';

export interface TerritoryAssignResult {
  territoryId?: string | null;
  ownerId?: string | null;
  ruleId?: string | null;
  viaAssignmentRule?: boolean;
  viaDefault?: boolean;
}

/**
 * Asks territory-service to route an entity from its routing `fields`. Returns
 * the assignment (whose fields may be null when nothing matched), or `null` when
 * the service is unconfigured/unreachable. NEVER throws.
 */
export async function assignTerritory(
  tenantId: string,
  entityType: TerritoryEntityType,
  fields: Record<string, unknown>
): Promise<TerritoryAssignResult | null> {
  if (!client) return null;
  try {
    const res = await client.post<{ success: boolean; data?: TerritoryAssignResult }>(
      '/api/v1/internal/territories/assign',
      { tenantId, entityType, fields },
      { 'x-tenant-id': tenantId }
    );
    if (!res?.success || !res.data) return null;
    return res.data;
  } catch (err) {
    console.warn('[territory-client] assign failed; continuing without routing', err);
    return null;
  }
}
