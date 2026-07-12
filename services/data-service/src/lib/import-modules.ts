/**
 * Per-module configuration for the CSV import pipeline: which Kafka topic a
 * module's create events go to, the event `type`, and the field-level
 * validation rules applied to each mapped row.
 *
 * Kept intentionally small and additive — unknown modules fall back to a
 * permissive config so imports never hard-fail for a module we don't model.
 */
import { TOPICS, type TopicName } from '@nexus/kafka';

export type FieldType = 'string' | 'number' | 'boolean' | 'email';

export interface FieldRule {
  /** Row fails validation if this field is missing/empty. */
  required?: boolean;
  /** Coercion + format check applied to the mapped value. */
  type?: FieldType;
}

export interface ModuleConfig {
  topic: TopicName;
  /** Event type emitted for each valid row, e.g. `lead.created`. */
  eventType: string;
  /** Validation rules keyed by target field name. */
  fields: Record<string, FieldRule>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Known import targets. Field maps translate CSV columns to these target field
 * names before validation runs.
 */
export const MODULE_CONFIGS: Record<string, ModuleConfig> = {
  leads: {
    topic: TOPICS.LEADS,
    eventType: 'lead.created',
    fields: {
      firstName: { type: 'string' },
      lastName: { required: true, type: 'string' },
      email: { type: 'email' },
      company: { type: 'string' },
      phone: { type: 'string' },
    },
  },
  contacts: {
    topic: TOPICS.CONTACTS,
    eventType: 'contact.created',
    fields: {
      firstName: { type: 'string' },
      lastName: { required: true, type: 'string' },
      email: { type: 'email' },
      phone: { type: 'string' },
      accountId: { type: 'string' },
    },
  },
  accounts: {
    topic: TOPICS.ACCOUNTS,
    eventType: 'account.created',
    fields: {
      name: { required: true, type: 'string' },
      website: { type: 'string' },
      industry: { type: 'string' },
      phone: { type: 'string' },
    },
  },
};

/**
 * Look up a module's import config, falling back to a permissive default
 * (no required fields, best-effort topic) so imports remain fail-open.
 */
export function getModuleConfig(module: string): ModuleConfig {
  return (
    MODULE_CONFIGS[module] ?? {
      topic: TOPICS.INTEGRATION,
      eventType: `${module}.created`,
      fields: {},
    }
  );
}

/**
 * Apply an optional per-field transform to a raw string value before validation.
 * Mapping templates may attach a `transform` to each column. Unknown transforms
 * are a no-op so a template can never hard-fail an import.
 */
export function applyTransform(value: string, transform?: string): string {
  if (!transform) return value;
  switch (transform.toLowerCase()) {
    case 'trim':
      return value.trim();
    case 'lowercase':
    case 'lower':
      return value.toLowerCase();
    case 'uppercase':
    case 'upper':
      return value.toUpperCase();
    case 'titlecase':
      return value.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    case 'digits':
      // Strip everything but digits — handy for phone columns.
      return value.replace(/\D+/g, '');
    default:
      return value;
  }
}

/**
 * Coerce + validate a single mapped row against a module's field rules.
 *
 * @returns `{ ok: true, value }` with type-coerced fields, or
 *   `{ ok: false, error }` describing the first failure.
 */
export function validateRow(
  config: ModuleConfig,
  mapped: Record<string, string>
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const value: Record<string, unknown> = {};
  const problems: string[] = [];

  // Carry over any mapped keys not explicitly modeled (best-effort passthrough).
  for (const [key, raw] of Object.entries(mapped)) {
    if (!(key in config.fields)) value[key] = raw;
  }

  for (const [field, rule] of Object.entries(config.fields)) {
    const raw = mapped[field];
    const present = raw !== undefined && raw !== '';

    if (!present) {
      if (rule.required) problems.push(`${field} is required`);
      continue;
    }

    switch (rule.type) {
      case 'number': {
        const num = Number(raw);
        if (Number.isNaN(num)) {
          problems.push(`${field} must be a number (got "${raw}")`);
        } else {
          value[field] = num;
        }
        break;
      }
      case 'boolean': {
        const lowered = raw.toLowerCase();
        if (['true', '1', 'yes', 'y'].includes(lowered)) value[field] = true;
        else if (['false', '0', 'no', 'n'].includes(lowered)) value[field] = false;
        else problems.push(`${field} must be a boolean (got "${raw}")`);
        break;
      }
      case 'email': {
        if (!EMAIL_RE.test(raw)) problems.push(`${field} must be a valid email (got "${raw}")`);
        else value[field] = raw;
        break;
      }
      default:
        value[field] = raw;
    }
  }

  if (problems.length > 0) {
    return { ok: false, error: problems.join('; ') };
  }
  return { ok: true, value };
}
