import { ValidationError } from './errors.js';

/**
 * RR-H18 — uniform request validation.
 *
 * The fleet historically validated input three inconsistent ways: Fastify
 * schema validation (422, no details), manual `Schema.parse()` throwing a raw
 * ZodError (400, `issues` array), and hand-built `ValidationError`s (422,
 * ad-hoc details). This module + the compiler wired in `createService` collapse
 * all of them onto ONE contract:
 *
 *   HTTP 422 + `{ success:false, error:{ code:'VALIDATION_ERROR',
 *   details: <flatten()>, requestId } }`
 *
 * `details` is always the zod `flatten()` shape (`{ formErrors, fieldErrors }`)
 * so clients can render field-level messages uniformly.
 */

/** A zod-error-shaped object (structural — avoids a hard zod dependency here). */
interface ZodLikeError {
  flatten?: () => unknown;
  issues?: unknown[];
  message?: string;
  name?: string;
}

/** A zod-schema-shaped object exposing `safeParse`. */
export interface ZodLikeSchema<T> {
  safeParse: (
    data: unknown
  ) => { success: true; data: T } | { success: false; error: ZodLikeError };
}

/**
 * Normalize any zod-shaped error into the standard `details` payload. Prefers
 * `flatten()`; falls back to `issues` (multiple hoisted zod copies under pnpm
 * can drop the prototype method) and finally to the message.
 */
export function flattenValidationError(error: unknown): unknown {
  const e = error as ZodLikeError | undefined;
  if (e && typeof e.flatten === 'function') {
    try {
      return e.flatten();
    } catch {
      /* fall through */
    }
  }
  if (e && Array.isArray(e.issues)) {
    return { formErrors: [], fieldErrors: {}, issues: e.issues };
  }
  return e?.message ?? 'Validation failed';
}

/** True when `error` looks like a zod ZodError regardless of the zod copy. */
export function isZodError(error: unknown): boolean {
  const e = error as ZodLikeError | undefined;
  return Boolean(e && e.name === 'ZodError' && Array.isArray(e.issues));
}

function validate<T>(schema: ZodLikeSchema<T>, data: unknown, location: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw new ValidationError(
    `Invalid request ${location}`,
    flattenValidationError(result.error)
  );
}

/** Validate a request body; throws `ValidationError` (422 + flatten) on failure. */
export function validateBody<T>(schema: ZodLikeSchema<T>, data: unknown): T {
  return validate(schema, data, 'body');
}

/** Validate request params; throws `ValidationError` (422 + flatten) on failure. */
export function validateParams<T>(schema: ZodLikeSchema<T>, data: unknown): T {
  return validate(schema, data, 'parameters');
}

/** Validate a request query; throws `ValidationError` (422 + flatten) on failure. */
export function validateQuery<T>(schema: ZodLikeSchema<T>, data: unknown): T {
  return validate(schema, data, 'query');
}
