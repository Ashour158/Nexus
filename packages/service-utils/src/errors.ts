import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import * as Sentry from '@sentry/node';

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
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} '${id}' not found`, 404);
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
  if (!error.statusCode || error.statusCode >= 500) {
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
      error: error.code,
      message: error.message,
    });
    return;
  }

  if ((error as { code?: string }).code === 'P2002') {
    reply.code(409).send({
      success: false,
      error: 'CONFLICT',
      message: 'Resource already exists',
    });
    return;
  }

  if ((error as { code?: string }).code === 'P2025') {
    reply.code(404).send({
      success: false,
      error: 'NOT_FOUND',
      message: 'Record not found',
    });
    return;
  }

  if (error.validation) {
    reply.code(422).send({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Validation failed',
    });
    return;
  }

  reply.code(500).send({
    success: false,
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
}
