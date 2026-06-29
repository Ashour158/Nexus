import { describe, expect, it } from 'vitest';
import {
  ConflictDomainError,
  InvariantDomainError,
  executeUseCase,
  isErr,
  isOk,
  ok,
} from '../index.js';

describe('domain-core', () => {
  it('creates typed success and failure results', () => {
    const success = ok({ id: 'record_1' });
    const failure = { ok: false as const, error: new ConflictDomainError('DUPLICATE', 'Duplicate record') };

    expect(isOk(success)).toBe(true);
    expect(isErr(success)).toBe(false);
    expect(success.value.id).toBe('record_1');
    expect(isErr(failure)).toBe(true);
    if (isErr(failure)) expect(failure.error.code).toBe('DUPLICATE');
  });

  it('converts domain errors thrown by use-cases into failed results', async () => {
    const result = await executeUseCase(
      {
        name: 'FailingUseCase',
        execute: async () => {
          throw new InvariantDomainError('RULE_BROKEN', 'Rule is broken');
        },
      },
      {}
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('RULE_BROKEN');
      expect(result.error.statusCode).toBe(409);
    }
  });

  it('converts unexpected errors into internal domain errors', async () => {
    const result = await executeUseCase(
      {
        name: 'UnexpectedUseCase',
        execute: async () => {
          throw new Error('database unavailable');
        },
      },
      {}
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNEXPECTED_DOMAIN_ERROR');
      expect(result.error.statusCode).toBe(500);
    }
  });
});
