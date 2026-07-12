/**
 * Pure, dependency-free evaluators for BlueprintTransition Before / During
 * semantics. Kept side-effect-free so they can run in the request path, the
 * available-transitions preview, and unit tests without any I/O.
 *
 * The criteria vocabulary intentionally mirrors the existing validation-service
 * `Rule` shape (required_field / min_value / activity_completed / contact_linked)
 * so playbook authors use one mental model across exit-criteria and transitions.
 */

export type Rule = {
  type: 'required_field' | 'min_value' | 'activity_completed' | 'contact_linked';
  field?: string;
  minValue?: number;
  activityType?: string;
  errorMessage?: string;
};

/** Read a possibly-nested field (`a.b.c`) out of a snapshot object. */
export function getSnapshotField(snapshot: Record<string, unknown>, field: string): unknown {
  const parts = field.split('.');
  let cur: unknown = snapshot;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Evaluate one criteria rule against a snapshot. Returns an error string or null. */
export function evalRule(rule: Rule, snapshot: Record<string, unknown>): string | null {
  const fail = (fallback: string) => rule.errorMessage ?? fallback;
  switch (rule.type) {
    case 'required_field': {
      if (!rule.field) return fail('A required field is missing.');
      const v = getSnapshotField(snapshot, rule.field);
      if (v === undefined || v === null || v === '') return fail(`Field "${rule.field}" is required.`);
      return null;
    }
    case 'min_value': {
      if (!rule.field || rule.minValue === undefined) return fail('A minimum-value rule is misconfigured.');
      const raw = getSnapshotField(snapshot, rule.field);
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isNaN(n) || n < rule.minValue)
        return fail(`Field "${rule.field}" must be at least ${rule.minValue}.`);
      return null;
    }
    case 'activity_completed': {
      const want = rule.activityType;
      if (!want) return fail('An activity-completed rule is misconfigured.');
      const types = snapshot.completedActivityTypes;
      if (Array.isArray(types) && types.includes(want)) return null;
      const acts = snapshot.activities;
      if (Array.isArray(acts)) {
        const ok = acts.some(
          (a) =>
            typeof a === 'object' &&
            a !== null &&
            (a as Record<string, unknown>).type === want &&
            (a as Record<string, unknown>).completed === true
        );
        if (ok) return null;
      }
      return fail(`A completed "${want}" activity is required.`);
    }
    case 'contact_linked': {
      if (snapshot.contactId) return null;
      const linked = snapshot.linkedContacts;
      if (Array.isArray(linked) && linked.length > 0) return null;
      return fail('A linked contact is required.');
    }
    default:
      return fail('Unmet transition criterion.');
  }
}

/** Evaluate an array of criteria; returns the list of unmet-criterion messages. */
export function evalCriteria(criteria: unknown, snapshot: Record<string, unknown>): string[] {
  if (!Array.isArray(criteria)) return [];
  const errors: string[] = [];
  for (const raw of criteria) {
    if (!raw || typeof raw !== 'object') continue;
    const msg = evalRule(raw as Rule, snapshot);
    if (msg) errors.push(msg);
  }
  return errors;
}

/** Normalized view of a transition's `beforeConditions` JSON. */
export interface BeforeConditions {
  criteria: Rule[];
  allowedRoles: string[];
}

export function parseBeforeConditions(raw: unknown): BeforeConditions {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const criteria = Array.isArray(obj.criteria) ? (obj.criteria as Rule[]) : [];
  const allowedRoles = Array.isArray(obj.allowedRoles)
    ? (obj.allowedRoles as unknown[]).filter((r): r is string => typeof r === 'string' && r.length > 0)
    : [];
  return { criteria, allowedRoles };
}

/**
 * Transition-owner role gate. An empty `allowedRoles` means "no role
 * restriction" — anyone with `blueprints:read` may run it. Otherwise the caller
 * must hold at least one of the allowed roles.
 */
export function isRoleAllowed(allowedRoles: string[], userRoles: string[]): boolean {
  if (allowedRoles.length === 0) return true;
  const have = new Set(userRoles);
  return allowedRoles.some((r) => have.has(r));
}

/** Normalized view of a transition's `duringConfig` JSON. */
export interface DuringConfig {
  mandatoryFields: string[];
  mandatoryActions: { id: string; label?: string }[];
  checklist: { id: string; label?: string; required?: boolean }[];
  message?: string;
}

export function parseDuringConfig(raw: unknown): DuringConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const mandatoryFields = Array.isArray(obj.mandatoryFields)
    ? (obj.mandatoryFields as unknown[]).filter((f): f is string => typeof f === 'string' && f.length > 0)
    : [];
  const mandatoryActions = Array.isArray(obj.mandatoryActions)
    ? (obj.mandatoryActions as unknown[])
        .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
        .map((a) => ({ id: String(a.id ?? ''), label: a.label ? String(a.label) : undefined }))
        .filter((a) => a.id.length > 0)
    : [];
  const checklist = Array.isArray(obj.checklist)
    ? (obj.checklist as unknown[])
        .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
        .map((c) => ({
          id: String(c.id ?? ''),
          label: c.label ? String(c.label) : undefined,
          required: c.required !== false,
        }))
        .filter((c) => c.id.length > 0)
    : [];
  const message = typeof obj.message === 'string' ? obj.message : undefined;
  return { mandatoryFields, mandatoryActions, checklist, message };
}

/** A single unmet During requirement, machine-readable for the client. */
export interface DuringViolation {
  requirement: 'mandatory_field' | 'mandatory_action' | 'checklist_item';
  id: string;
  message: string;
}

/**
 * Validate the DURING requirements against the submitted data + checklist map.
 * Returns the list of specific violations (empty ⇒ all satisfied).
 *
 * - mandatoryFields: each key must be present & non-empty in `data`.
 * - mandatoryActions: each action id must be truthy in `checklist`.
 * - checklist: each item with `required !== false` must be truthy in `checklist`.
 */
export function validateDuring(
  during: DuringConfig,
  data: Record<string, unknown>,
  checklist: Record<string, unknown>
): DuringViolation[] {
  const violations: DuringViolation[] = [];

  for (const field of during.mandatoryFields) {
    const v = getSnapshotField(data, field);
    if (v === undefined || v === null || v === '') {
      violations.push({
        requirement: 'mandatory_field',
        id: field,
        message: `Mandatory field "${field}" must be provided to complete this transition.`,
      });
    }
  }

  for (const action of during.mandatoryActions) {
    if (!checklist[action.id]) {
      violations.push({
        requirement: 'mandatory_action',
        id: action.id,
        message: `Mandatory action "${action.label ?? action.id}" must be completed.`,
      });
    }
  }

  for (const item of during.checklist) {
    if (item.required && !checklist[item.id]) {
      violations.push({
        requirement: 'checklist_item',
        id: item.id,
        message: `Checklist item "${item.label ?? item.id}" must be checked.`,
      });
    }
  }

  return violations;
}
