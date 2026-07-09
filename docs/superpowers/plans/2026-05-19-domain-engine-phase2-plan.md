# Domain Engine Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the first shared domain core package and move CRM bulk orchestration behind a business use-case boundary without changing public routes.

**Architecture:** The UI remains workflow-oriented and existing APIs remain compatible. Cross-module business orchestration starts moving into use-cases that return typed domain results, use actor/tenant context, and compose cleanly with validation, approval, audit, outbox, and workflow engines.

**Tech Stack:** TypeScript, pnpm workspaces, NodeNext ESM packages, Vitest, Fastify, existing CRM service modules, existing Kafka producer interface.

---

### File Structure

- Create: `packages/domain-core/package.json`
  - Workspace package manifest for `@nexus/domain-core`.
- Create: `packages/domain-core/tsconfig.json`
  - TypeScript build configuration matching existing packages.
- Create: `packages/domain-core/src/result.ts`
  - Domain result helpers: `ok`, `err`, `isOk`, `isErr`.
- Create: `packages/domain-core/src/errors.ts`
  - Standard domain errors with stable error codes.
- Create: `packages/domain-core/src/context.ts`
  - Tenant, actor, audit, and execution context types.
- Create: `packages/domain-core/src/events.ts`
  - Standard domain event and publisher interfaces.
- Create: `packages/domain-core/src/use-case.ts`
  - Business use-case interface and safe executor.
- Create: `packages/domain-core/src/testing.ts`
  - Test helpers for use-cases.
- Create: `packages/domain-core/src/index.ts`
  - Public exports.
- Create: `packages/domain-core/src/__tests__/domain-core.test.ts`
  - Unit tests for result helpers, domain errors, and use-case executor.
- Modify: `services/crm-service/package.json`
  - Add `@nexus/domain-core` workspace dependency.
- Create: `services/crm-service/src/use-cases/bulk-records.use-case.ts`
  - Business boundary for bulk update, delete, tag, and reassign operations.
- Create: `services/crm-service/src/use-cases/__tests__/bulk-records.use-case.test.ts`
  - Unit tests proving permissions, tenant-scoped target user validation, hard delete rejection, and service-layer routing.
- Modify: `services/crm-service/src/routes/bulk.routes.ts`
  - Keep request/response compatibility but delegate business orchestration to the use-case.

### Task 1: Create Domain Core Tests

**Files:**
- Create: `packages/domain-core/src/__tests__/domain-core.test.ts`

- [x] **Step 1: Write unit tests for the shared domain primitives**

```ts
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
    const result = await executeUseCase({
      name: 'FailingUseCase',
      execute: async () => {
        throw new InvariantDomainError('RULE_BROKEN', 'Rule is broken');
      },
    }, {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('RULE_BROKEN');
      expect(result.error.statusCode).toBe(409);
    }
  });

  it('converts unexpected errors into internal domain errors', async () => {
    const result = await executeUseCase({
      name: 'UnexpectedUseCase',
      execute: async () => {
        throw new Error('database unavailable');
      },
    }, {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNEXPECTED_DOMAIN_ERROR');
      expect(result.error.statusCode).toBe(500);
    }
  });
});
```

- [x] **Step 2: Run the test and verify it fails before implementation**

Run: `pnpm --filter @nexus/domain-core test`

Expected: package or exported symbols are missing before Task 2 creates the package.

### Task 2: Implement Domain Core Package

**Files:**
- Create: `packages/domain-core/package.json`
- Create: `packages/domain-core/tsconfig.json`
- Create: `packages/domain-core/src/result.ts`
- Create: `packages/domain-core/src/errors.ts`
- Create: `packages/domain-core/src/context.ts`
- Create: `packages/domain-core/src/events.ts`
- Create: `packages/domain-core/src/use-case.ts`
- Create: `packages/domain-core/src/testing.ts`
- Create: `packages/domain-core/src/index.ts`

- [x] **Step 1: Add the package manifest**

```json
{
  "name": "@nexus/domain-core",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc --project tsconfig.json",
    "typecheck": "tsc --noEmit",
    "dev": "tsc --project tsconfig.json --watch",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.5.3",
    "vitest": "^1.6.0"
  }
}
```

- [x] **Step 2: Add TypeScript configuration**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [x] **Step 3: Implement result helpers**

```ts
export type DomainSuccess<T> = {
  ok: true;
  value: T;
};

export type DomainFailure<E extends Error = Error> = {
  ok: false;
  error: E;
};

export type DomainResult<T, E extends Error = Error> = DomainSuccess<T> | DomainFailure<E>;

export function ok<T>(value: T): DomainSuccess<T> {
  return { ok: true, value };
}

export function err<E extends Error>(error: E): DomainFailure<E> {
  return { ok: false, error };
}

export function isOk<T, E extends Error>(result: DomainResult<T, E>): result is DomainSuccess<T> {
  return result.ok;
}

export function isErr<T, E extends Error>(result: DomainResult<T, E>): result is DomainFailure<E> {
  return !result.ok;
}
```

- [x] **Step 4: Implement domain errors**

```ts
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
```

- [x] **Step 5: Implement context and event contracts**

```ts
export type ActorContext = {
  userId: string;
  tenantId: string;
  email?: string;
  roles: string[];
  permissions: string[];
};

export type AuditContext = {
  actor: ActorContext;
  requestId?: string;
  correlationId?: string;
  source: 'api' | 'worker' | 'system' | 'import' | 'automation';
};

export type EngineContext = {
  audit: AuditContext;
  now: Date;
  idempotencyKey?: string;
};
```

```ts
export type DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  eventId: string;
  type: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  occurredAt: Date;
  actorId?: string;
  correlationId?: string;
  payload: TPayload;
};

export type DomainEventPublisher = {
  publish<TPayload extends Record<string, unknown>>(event: DomainEvent<TPayload>): Promise<void>;
};
```

- [x] **Step 6: Implement use-case executor and test helpers**

```ts
import { DomainError } from './errors.js';
import { err, type DomainResult } from './result.js';

export type BusinessUseCase<TInput, TOutput> = {
  name: string;
  execute(input: TInput): Promise<TOutput>;
};

export async function executeUseCase<TInput, TOutput>(
  useCase: BusinessUseCase<TInput, TOutput>,
  input: TInput
): Promise<DomainResult<TOutput, DomainError>> {
  try {
    return { ok: true, value: await useCase.execute(input) };
  } catch (error) {
    if (error instanceof DomainError) return err(error);
    return err(new DomainError('UNEXPECTED_DOMAIN_ERROR', `${useCase.name} failed unexpectedly`, 500));
  }
}
```

```ts
import type { ActorContext, EngineContext } from './context.js';

export function createTestActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId: 'usr_test',
    tenantId: 'tenant_test',
    roles: ['admin'],
    permissions: ['*'],
    ...overrides,
  };
}

export function createTestEngineContext(overrides: Partial<EngineContext> = {}): EngineContext {
  const actor = overrides.audit?.actor ?? createTestActor();
  return {
    audit: {
      actor,
      source: 'api',
      requestId: 'req_test',
      correlationId: 'corr_test',
      ...overrides.audit,
    },
    now: new Date('2026-01-01T00:00:00.000Z'),
    idempotencyKey: 'idem_test',
    ...overrides,
  };
}
```

- [x] **Step 7: Export public symbols**

```ts
export * from './context.js';
export * from './errors.js';
export * from './events.js';
export * from './result.js';
export * from './testing.js';
export * from './use-case.js';
```

- [x] **Step 8: Verify the package**

Run: `pnpm --filter @nexus/domain-core typecheck`

Expected: TypeScript exits with code `0`.

Run: `pnpm --filter @nexus/domain-core test`

Expected: Vitest exits with code `0`.

### Task 3: Add CRM Bulk Use-Case Tests

**Files:**
- Modify: `services/crm-service/package.json`
- Create: `services/crm-service/src/use-cases/__tests__/bulk-records.use-case.test.ts`

- [x] **Step 1: Add `@nexus/domain-core` dependency to CRM service**

```json
"@nexus/domain-core": "workspace:*"
```

- [x] **Step 2: Write use-case tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTestEngineContext } from '@nexus/domain-core';
import { createBulkRecordsUseCase } from '../bulk-records.use-case.js';

function makeDeps() {
  const services = {
    contact: { update: vi.fn(), archive: vi.fn() },
    deal: { update: vi.fn(), archive: vi.fn() },
    lead: { update: vi.fn(), archive: vi.fn() },
    account: { update: vi.fn(), archive: vi.fn() },
  };
  const prisma = {
    user: { findFirst: vi.fn() },
    contact: { findMany: vi.fn() },
    deal: { findMany: vi.fn() },
    lead: { findMany: vi.fn() },
    account: { findMany: vi.fn() },
  };
  const producer = { publish: vi.fn() };
  return { services, prisma, producer };
}

describe('bulk records use-case', () => {
  it('rejects hard delete before touching module services', async () => {
    const deps = makeDeps();
    const useCase = createBulkRecordsUseCase(deps as never);
    const ctx = createTestEngineContext();

    await expect(useCase.bulkDelete(ctx, { entityType: 'contact', ids: ['contact_1'], hard: true })).rejects.toMatchObject({
      code: 'UNSUPPORTED_BULK_HARD_DELETE',
    });

    expect(deps.services.contact.archive).not.toHaveBeenCalled();
  });

  it('routes bulk updates through module services and publishes event', async () => {
    const deps = makeDeps();
    const useCase = createBulkRecordsUseCase(deps as never);
    const ctx = createTestEngineContext();

    const result = await useCase.bulkUpdate(ctx, {
      entityType: 'contact',
      ids: ['contact_1', 'contact_2'],
      updates: { ownerId: 'usr_owner', email: 'blocked@example.com' },
    });

    expect(result.updated).toBe(2);
    expect(deps.services.contact.update).toHaveBeenCalledTimes(2);
    expect(deps.services.contact.update).toHaveBeenCalledWith('tenant_test', 'contact_1', { ownerId: 'usr_owner' }, 'usr_test');
    expect(deps.producer.publish).toHaveBeenCalledWith('contact.bulk.updated', expect.objectContaining({ count: 2 }));
  });

  it('requires target user to belong to the tenant for bulk reassign', async () => {
    const deps = makeDeps();
    deps.prisma.user.findFirst.mockResolvedValue(null);
    const useCase = createBulkRecordsUseCase(deps as never);
    const ctx = createTestEngineContext();

    await expect(useCase.bulkReassign(ctx, {
      entityType: 'contact',
      ids: ['contact_1'],
      toUserId: 'usr_missing',
    })).rejects.toMatchObject({ code: 'TARGET_USER_NOT_IN_TENANT' });
  });
});
```

- [x] **Step 3: Run the use-case test and verify it fails before implementation**

Run: `pnpm --filter @nexus/crm-service test -- src/use-cases/__tests__/bulk-records.use-case.test.ts`

Expected: test fails because `bulk-records.use-case.ts` does not exist yet.

### Task 4: Implement CRM Bulk Use-Case Boundary

**Files:**
- Create: `services/crm-service/src/use-cases/bulk-records.use-case.ts`
- Modify: `services/crm-service/src/routes/bulk.routes.ts`

- [x] **Step 1: Implement the bulk records use-case**

Use a factory named `createBulkRecordsUseCase` with methods:

```ts
bulkUpdate(ctx, input): Promise<{ updated: number }>
bulkDelete(ctx, input): Promise<{ deleted: number }>
bulkTag(ctx, input): Promise<{ processed: number }>
bulkReassign(ctx, input): Promise<Record<string, number>>
```

The implementation must:
- Enforce per-entity allowed update fields.
- Reject hard delete with `InvariantDomainError('UNSUPPORTED_BULK_HARD_DELETE', ...)`.
- Route updates and archive/delete behavior through existing module service methods.
- Validate target user with `prisma.user.findFirst({ where: { id: toUserId, tenantId } })`.
- Publish the same Kafka topics currently emitted by the route.

- [x] **Step 2: Route compatibility**

In `services/crm-service/src/routes/bulk.routes.ts`, keep the same URLs:

```txt
POST /api/v1/bulk/update
POST /api/v1/bulk/delete
POST /api/v1/bulk/tag
POST /api/v1/bulk/reassign
```

Keep the same response envelope:

```json
{ "success": true, "data": { "...": "..." } }
```

Map `DomainError.statusCode`, `DomainError.code`, and `DomainError.message` into the existing error envelope.

- [x] **Step 3: Verify the CRM service**

Run: `pnpm --filter @nexus/crm-service typecheck`

Expected: TypeScript exits with code `0`.

Run: `pnpm --filter @nexus/crm-service test -- src/use-cases/__tests__/bulk-records.use-case.test.ts`

Expected: Vitest exits with code `0`.

### Task 5: Final Verification

**Files:**
- Read: `docs/architecture/CANONICAL_ARCHITECTURE.md`
- Read: `docs/architecture/REPO_CLEANUP_INVENTORY.md`

- [x] **Step 1: Run focused verification**

Run:

```powershell
pnpm --filter @nexus/domain-core typecheck
pnpm --filter @nexus/domain-core test
pnpm --filter @nexus/crm-service typecheck
pnpm --filter @nexus/crm-service test -- src/use-cases/__tests__/bulk-records.use-case.test.ts
pnpm --filter @nexus/web typecheck
```

Expected: all commands exit with code `0`.

- [x] **Step 2: Confirm Phase 2 scope**

Phase 2 is complete when:
- `@nexus/domain-core` exists and passes tests.
- CRM bulk business orchestration lives in a use-case file, not directly in the route.
- Existing public CRM bulk routes keep the same URLs and response envelopes.
- No active service routes are moved or deleted.
