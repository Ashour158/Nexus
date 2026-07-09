export class DomainError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationDomainError extends DomainError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 400, details);
  }
}

export class PermissionDomainError extends DomainError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 403, details);
  }
}

export class NotFoundDomainError extends DomainError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 404, details);
  }
}

export class ConflictDomainError extends DomainError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 409, details);
  }
}

export class InvariantDomainError extends DomainError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, 409, details);
  }
}
