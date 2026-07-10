/**
 * Lightweight client for blueprint-service internal validation API.
 *
 * ─── BL-2: fail-open only when a pipeline has no blueprint ────────────────────
 * Historically, ANY blueprint-service outage blocked EVERY stage move (including
 * an ordinary Kanban drag on a pipeline that never had a single blueprint rule),
 * freezing the whole pipeline. That is wrong: a pipeline with no governing
 * blueprint should not depend on blueprint-service being healthy.
 *
 * The client now keeps a short in-process cache of "does this transition have a
 * blueprint?" (keyed per tenant+pipeline+from+to). Presence is learned during
 * healthy operation:
 *   - a real validation that returns errors  ⇒ the transition IS governed (true);
 *   - otherwise a cheap empty-snapshot probe disambiguates "no rules" (valid)
 *     from "rules that happened to pass" (invalid ⇒ governed). Every blueprint
 *     rule type (required_field / min_value / activity_completed / contact_linked
 *     and playbook requiredFields) fails on an empty snapshot, so a probe that
 *     comes back `valid` is a reliable "no blueprint" signal.
 *
 * When blueprint-service is unavailable:
 *   - a **terminal** move (into a won/lost stage) always stays **fail-CLOSED**;
 *   - a non-terminal move is **fail-OPEN only when the cache says the transition
 *     has no blueprint**; a known-governed transition (or an unknown one) stays
 *     fail-CLOSED so genuine rules are never silently skipped.
 * A genuine rule violation on the healthy path always blocks.
 */

import { createHttpClient, BusinessRuleError } from '@nexus/service-utils';

const BASE_URL = process.env.BLUEPRINT_SERVICE_URL ?? 'http://localhost:3013';
const TOKEN = process.env.BLUEPRINT_SERVICE_TOKEN ?? process.env.INTERNAL_SERVICE_TOKEN ?? '';

const client = createHttpClient({
  baseURL: BASE_URL,
  headers: { 'x-blueprint-service-token': TOKEN },
  maxRetries: 2,
  timeoutMs: 5_000,
});

export interface DealSnapshot {
  [key: string]: unknown;
  contactId?: string;
  linkedContacts?: Array<{ id: string }>;
  completedActivityTypes?: string[];
  activities?: Array<{ type: string; completed: boolean }>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  /** Optional forward-compat hint from blueprint-service. */
  hasBlueprint?: boolean;
}

export interface StageTransitionOpts {
  /** true when the destination stage is a won/lost (terminal) stage. */
  toStageIsTerminal?: boolean;
}

// ─── In-process "transition has a blueprint?" cache ──────────────────────────

const PRESENCE_TTL_MS = 45_000;
const PRESENCE_MAX_ENTRIES = 5_000;
const presenceCache = new Map<string, { hasBlueprint: boolean; expiresAt: number }>();

function presenceKey(tenantId: string, pipelineId: string, from: string, to: string): string {
  return `${tenantId}:${pipelineId}:${from}:${to}`;
}

function getCachedPresence(key: string): boolean | null {
  const entry = presenceCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    presenceCache.delete(key);
    return null;
  }
  return entry.hasBlueprint;
}

function setCachedPresence(key: string, hasBlueprint: boolean): void {
  // Cheap bound: drop the oldest inserted entry when the map grows too large.
  if (presenceCache.size >= PRESENCE_MAX_ENTRIES) {
    const oldest = presenceCache.keys().next().value;
    if (oldest !== undefined) presenceCache.delete(oldest);
  }
  presenceCache.set(key, { hasBlueprint, expiresAt: Date.now() + PRESENCE_TTL_MS });
}

/**
 * Probe (empty snapshot) to learn whether a transition is governed by any
 * blueprint rule. Runs only when the presence cache is cold and only to WARM
 * the cache for a future outage — its result never affects the current move, so
 * it is fire-and-forget and swallows every error. During an outage the probe
 * also fails and simply leaves the cache untouched (unknown).
 */
function warmPresence(tenantId: string, pipelineId: string, from: string, to: string): void {
  const key = presenceKey(tenantId, pipelineId, from, to);
  if (getCachedPresence(key) !== null) return;
  client
    .post<{ success: boolean; data: ValidationResult }>(
      '/api/v1/blueprints/internal/validate-transition',
      { pipelineId, fromStageId: from, toStageId: to, dealSnapshot: {} },
      { 'x-tenant-id': tenantId }
    )
    .then((res) => {
      const data = res?.data;
      if (!data) return;
      const has = typeof data.hasBlueprint === 'boolean' ? data.hasBlueprint : data.valid === false;
      setCachedPresence(key, has);
    })
    .catch(() => undefined);
}

function isServiceUnavailable(err: any): boolean {
  const code = err?.code ?? err?.cause?.code ?? '';
  const status = typeof err?.status === 'number' ? err.status : (err?.statusCode ?? 0);
  return (
    status >= 500 ||
    code === 'TIMEOUT' ||
    code === 'CIRCUIT_OPEN' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'NETWORK_ERROR' ||
    err instanceof TypeError
  );
}

export async function validateStageTransition(
  tenantId: string,
  pipelineId: string,
  fromStageId: string,
  toStageId: string,
  dealSnapshot: DealSnapshot,
  opts?: StageTransitionOpts
): Promise<ValidationResult> {
  const key = presenceKey(tenantId, pipelineId, fromStageId, toStageId);
  try {
    const res = await client.post<{ success: boolean; data: ValidationResult }>(
      '/api/v1/blueprints/internal/validate-transition',
      { pipelineId, fromStageId, toStageId, dealSnapshot },
      { 'x-tenant-id': tenantId }
    );
    const result = res.data;
    // Warm the presence cache from the authoritative result. Any real error is a
    // definitive "governed" signal; a clean pass is ambiguous, so warm it lazily
    // with a background probe (does not affect this response).
    if (typeof result.hasBlueprint === 'boolean') {
      setCachedPresence(key, result.hasBlueprint);
    } else if (result.valid === false || (Array.isArray(result.errors) && result.errors.length > 0)) {
      setCachedPresence(key, true);
    } else {
      warmPresence(tenantId, pipelineId, fromStageId, toStageId);
    }
    return result;
  } catch (err: any) {
    if (isServiceUnavailable(err)) {
      // Terminal (won/lost) transitions always stay fail-closed.
      if (opts?.toStageIsTerminal) {
        throw new BusinessRuleError(
          'Stage transition validation is unavailable; closing this deal is blocked until blueprint validation is healthy',
          { service: 'blueprint-service', cause: err?.message }
        );
      }
      // Fail-open ONLY when we positively know this transition has no blueprint.
      if (getCachedPresence(key) === false) {
        return { valid: true, errors: [] };
      }
      // Known-governed or unknown ⇒ fail-closed so no rule is silently skipped.
      throw new BusinessRuleError(
        'Stage transition validation is unavailable; transition blocked until blueprint validation is healthy',
        { service: 'blueprint-service', cause: err?.message }
      );
    }
    throw err;
  }
}

/**
 * Throws BusinessRuleError when validation fails.
 */
export async function assertValidStageTransition(
  tenantId: string,
  pipelineId: string,
  fromStageId: string,
  toStageId: string,
  dealSnapshot: DealSnapshot,
  opts?: StageTransitionOpts
): Promise<void> {
  const result = await validateStageTransition(tenantId, pipelineId, fromStageId, toStageId, dealSnapshot, opts);
  if (!result.valid) {
    throw new BusinessRuleError(
      `Stage transition blocked: ${result.errors.join('; ')}`
    );
  }
}
