/**
 * Governance error-path posture.
 *
 * DEFAULT (env unset / false) = fail-OPEN: if a governance guard's evaluation
 * THROWS (DB outage, malformed rule, etc.) the write/read is ALLOWED, so an
 * internal fault never blocks the business. This preserves historical behavior.
 *
 * Set `NEXUS_GOVERNANCE_FAIL_CLOSED=true` (or 1/yes/on) to fail-CLOSED: an
 * evaluation fault DENIES instead, so a fault can never silently disable
 * field-level security / validation rules / record sharing.
 *
 * IMPORTANT: this ONLY changes the ERROR path. The "no rules configured for the
 * tenant => allow" opt-in contract is unchanged in both modes — a tenant that
 * has configured nothing is never blocked.
 */
export function governanceFailClosed(): boolean {
  const v = String(process.env.NEXUS_GOVERNANCE_FAIL_CLOSED ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

/** Thrown on the error path when governance is configured fail-closed. Maps to HTTP 503. */
export class GovernanceUnavailableError extends Error {
  readonly statusCode = 503;
  readonly code = 'GOVERNANCE_UNAVAILABLE';
  constructor(check: string) {
    super(
      `Governance check "${check}" could not be evaluated and the system is configured ` +
        `fail-closed (NEXUS_GOVERNANCE_FAIL_CLOSED); the operation was denied.`
    );
    this.name = 'GovernanceUnavailableError';
  }
}
