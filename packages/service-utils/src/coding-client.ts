/**
 * CodingClient — best-effort coding engine integration.
 *
 * Calls metadata-service `/internal/codes/:entityType/allocate` to get a
 * tenant-scoped sequential code.  Falls back to a timestamp-based code
 * when the coding engine is unreachable or mis-configured so that
 * creating a record never hard-fails because of the coding dependency.
 */

import { NexusHttpClient } from './http-client.js';

export interface AllocationContext {
  tenantId: string;
  ownerId?: string;
  territoryId?: string;
  branchId?: string;
  teamId?: string;
  category?: string;
  manualCode?: string;
}

export interface AllocateCodeResult {
  code: string;
  ruleId: string;
  scopeKey: string;
}

export interface CodingClientOptions {
  baseURL: string;
  serviceToken?: string;
}

export class CodingClient {
  private http: NexusHttpClient;

  constructor(opts: CodingClientOptions) {
    const headers: Record<string, string> = {};
    if (opts.serviceToken) {
      headers['x-service-token'] = opts.serviceToken;
    }
    this.http = new NexusHttpClient({ baseURL: opts.baseURL, headers });
  }

  /**
   * Allocate a code for the given entity type and tenant.
   * Falls back to `FALLBACK-${entityType}-${Date.now()}` on any error.
   */
  async allocateCode(
    tenantId: string,
    entityType: string,
    ctx: Omit<AllocationContext, 'tenantId'> = {}
  ): Promise<string> {
    try {
      const result = await this.http.post<AllocateCodeResult>(
        `/api/v1/internal/codes/${encodeURIComponent(entityType)}/allocate`,
        { tenantId, ...ctx }
      );
      return result.code;
    } catch (err) {
      // Best-effort: return a fallback timestamp code so the create flow
      // never hard-fails because the coding engine is down.
      return `FALLBACK-${entityType.toUpperCase()}-${Date.now()}`;
    }
  }
}

/** Convenience factory. */
export function createCodingClient(opts: CodingClientOptions): CodingClient {
  return new CodingClient(opts);
}
