import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import * as Sentry from '@sentry/node';
import { flattenValidationError } from './validation.js';

export class NexusError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'NexusError';
  }
}

export class NotFoundError extends NexusError {
  constructor(resource: string, id?: string) {
    // Two call conventions are in use: NotFoundError('Account', id) →
    // "Account '<id>' not found", and NotFoundError('Subscription not found')
    // where the caller passes a complete message. Support both.
    super('NOT_FOUND', id ? `${resource} '${id}' not found` : resource, 404);
  }
}

export class ValidationError extends NexusError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 422, details);
  }
}

export class UnauthorizedError extends NexusError {
  constructor(message = 'Not authenticated') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends NexusError {
  constructor(permission?: string) {
    super('FORBIDDEN', permission ? `Missing permission: ${permission}` : 'Forbidden', 403);
  }
}

export class ConflictError extends NexusError {
  constructor(resource: string, field: string) {
    super('CONFLICT', `${resource} with this ${field} already exists`, 409);
  }
}

export class ServiceUnavailableError extends NexusError {
  constructor(service: string) {
    super('SERVICE_UNAVAILABLE', `${service} is temporarily unavailable`, 503);
  }
}

export class BusinessRuleError extends NexusError {
  constructor(message: string, details?: unknown) {
    super('BUSINESS_RULE_VIOLATION', message, 422, details);
  }
}

/** Section 47 — domain errors + standard `{ success, error }` envelope */
export function globalErrorHandler(
  error: FastifyError | NexusError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const isZodError =
    (error as { name?: string }).name === 'ZodError' &&
    Array.isArray((error as { issues?: unknown }).issues);
  // ZodError is malformed client input (→ 422), never a server fault; skip Sentry.
  if (!isZodError && (!error.statusCode || error.statusCode >= 500)) {
    Sentry.captureException(error, {
      extra: {
        url: request.url,
        method: request.method,
        tenantId: (request.user as { tenantId?: string } | undefined)?.tenantId,
      },
    });
  }

  request.log.error({ err: error, requestId: request.id });

  if (error instanceof NexusError) {
    reply.code(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId: request.id,
      },
    });
    return;
  }

  // Raw ZodError from manual `Schema.parse(request.params/body/query)` inside a
  // handler (as opposed to Fastify schema validation, handled via
  // `error.validation` below). Detected by shape rather than `instanceof` so it
  // survives multiple zod copies hoisted under pnpm. Malformed client input is a
  // 422 — NOT a 500 — and must not be reported to Sentry as a server error.
  const zodIssues = (error as { name?: string; issues?: unknown }).issues;
  if ((error as { name?: string }).name === 'ZodError' && Array.isArray(zodIssues)) {
    // RR-H18: schema-validation failures are ALWAYS 422 (was 400 here) with a
    // uniform `details = flatten()` shape, matching the ValidationError branch.
    reply.code(422).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: flattenValidationError(error),
        requestId: request.id,
      },
    });
    return;
  }

  if ((error as { code?: string }).code === 'P2002') {
    reply.code(409).send({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'Resource already exists',
        requestId: request.id,
      },
    });
    return;
  }

  if ((error as { code?: string }).code === 'P2025') {
    reply.code(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Record not found',
        requestId: request.id,
      },
    });
    return;
  }

  if (error.validation) {
    // RR-H18: Fastify schema-validation failures — 422 with the SAME
    // `details` shape as raw-ZodError and ValidationError paths. `error.validation`
    // or an AJV error array; expose it directly as `details`.
    reply.code(422).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.validation,
        requestId: request.id,
      },
    });
    return;
  }

  // Rate-limit rejections must return 429 so clients back off instead of treating a
  // throttle as a server fault. @fastify/rate-limit's error reaches here WITHOUT a
  // usable statusCode, so detect it by code/message too (not just statusCode).
  const rlCode = (error as { code?: string }).code;
  // Also inspect the nested envelope: a plugin's errorResponseBuilder may return
  // a response-shaped object whose code/message live under `error.error`, in
  // which case every top-level probe below reads undefined and the throttle
  // would silently degrade into a 500.
  const nested = (error as { error?: { code?: string; message?: string } }).error;
  const isRateLimit =
    (error as { statusCode?: number }).statusCode === 429 ||
    rlCode === 'FST_ERR_RATE_LIMIT' ||
    rlCode === 'RATE_LIMITED' ||
    nested?.code === 'RATE_LIMITED' ||
    /rate ?limit/i.test(error.message || nested?.message || '');
  if (isRateLimit) {
    reply.code(429).send({
      success: false,
      error: { code: 'RATE_LIMITED', message: error.message || 'Rate limit exceeded', requestId: request.id },
    });
    return;
  }

  // Other framework/plugin errors that already carry a 4xx status must NOT be
  // flattened to 500 either — return the real status with a stable code.
  const sc = (error as { statusCode?: number }).statusCode;
  if (typeof sc === 'number' && sc >= 400 && sc < 500) {
    reply.code(sc).send({
      success: false,
      error: {
        code: (error as { code?: string }).code ?? (sc === 429 ? 'RATE_LIMITED' : 'REQUEST_REJECTED'),
        message: error.message || 'Request rejected',
        requestId: request.id,
      },
    });
    return;
  }

  reply.code(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: request.id,
    },
  });
}
