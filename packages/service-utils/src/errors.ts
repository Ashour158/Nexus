import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

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

  if ((error as { code?: string }).code === 'P2002') {
    reply.code(409).send({
      success: false,
      error: { code: 'CONFLICT', message: 'Resource already exists', requestId: request.id },
    });
    return;
  }

  if ((error as { code?: string }).code === 'P2025') {
    reply.code(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Record not found', requestId: request.id },
    });
    return;
  }

  if (error.validation) {
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

  reply.code(500).send({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId: request.id },
  });
}
