/**
 * Structural stand-in for a generated Prisma client.
 *
 * NOT `import type { PrismaClient } from '@prisma/client'`: every service here
 * generates its client to its own output path (`node_modules/.prisma/
 * <service>-client`), so the bare `@prisma/client` package has no generated
 * `default.d.ts` and exports no `PrismaClient`. That import failed this
 * package's typecheck AND build, and since every service depends on
 * @nexus/service-utils it failed the whole root build with it.
 *
 * This extension only ever reaches delegates dynamically
 * (`base[delegateName(model)]`, via an explicit cast), so it needs no structural
 * guarantees at all — `object` is the honest constraint.
 *
 * NOTE: do NOT tighten this to `Record<string, unknown>`. A generated
 * PrismaClient is a class instance with no index signature, so that constraint
 * rejects every real client (`Index signature for type 'string' is missing`).
 */
type PrismaClientLike = object;

/**
 * Thrown when a tenant-scoped Prisma model operation runs without a tenantId in
 * the request/consumer AsyncLocalStorage. This is a FAIL-CLOSED signal: rather
 * than silently running an unscoped (cross-tenant) query, the extension aborts.
 *
 * Seeing this in logs means a real bug at the call site — the code path did not
 * seed tenant context. Fix it by seeding the tenant ALS before the query
 * (HTTP preHandler already does this; Kafka consumers and internal
 * service-token routes must do it explicitly), OR — if the model is genuinely
 * tenant-less (global config, infra, cross-tenant lookup) — add it to the
 * `skipModels` allowlist passed to `createTenantPrismaExtension`.
 */
export class TenantContextError extends Error {
  readonly code = 'TENANT_CONTEXT_MISSING';
  constructor(
    public readonly model: string,
    public readonly operation: string
  ) {
    super(
      `Tenant context required for ${model}.${operation} but none was found in ` +
        `AsyncLocalStorage. Seed the tenant context before this query, or add ` +
        `"${model}" to skipModels if it is genuinely tenant-less.`
    );
    this.name = 'TenantContextError';
  }
}

/**
 * Models that are tenant-less by construction and must never be tenant-scoped
 * (no `tenantId` column): migration bookkeeping / health / global infra. Merged
 * into every service's `skipModels` so fail-closed enforcement can never throw
 * for these, regardless of per-service config. Note: raw `$queryRaw` health
 * probes and Prisma migrations do NOT flow through this model extension at all,
 * so bootstrap is unaffected — this set is defense-in-depth for the rare model
 * op against a global table.
 */
export const DEFAULT_SKIP_TENANT_MODELS: ReadonlySet<string> = new Set<string>([
  'HealthCheck',
  'SchemaMigration',
  'PrismaMigration',
]);

/**
 * Expand Prisma's compound-unique shorthand into its component fields.
 *
 * `findUnique({ where: { id_tenantId: { id, tenantId } } })` is valid ONLY on
 * findUnique. This extension remaps findUnique → findFirst, and findFirst
 * rejects that key with `Unknown argument 'id_tenantId'` — so before this
 * function existed, every compound-unique lookup through the extension threw.
 * (That silently killed notification-service's entire consumer path: each write
 * threw, retried 3x, and was dropped, while the service reported healthy.)
 *
 * Detection is exact, not heuristic: a key is treated as compound-unique only
 * when its own name equals its inner keys joined by `_` — precisely how Prisma
 * generates these names. A JSON column that happens to be named `foo_bar` and
 * holds a nested filter will not match, so it is left untouched.
 */
export function flattenCompoundUniqueWhere(
  where: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      key.includes('_') &&
      Object.keys(value as Record<string, unknown>).join('_') === key
    ) {
      Object.assign(out, value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function mergeWhere(
  args: Record<string, unknown>,
  tenantId: string
): Record<string, unknown> {
  const where = (args.where as Record<string, unknown> | undefined) ?? {};
  // Flatten first: the caller may have used compound-unique shorthand, which the
  // findFirst we are about to delegate to cannot parse.
  return { ...args, where: { ...flattenCompoundUniqueWhere(where), tenantId } };
}

export function applyTenantArgs(
  operation: string,
  args: Record<string, unknown>,
  tenantId: string
): Record<string, unknown> {
  switch (operation) {
    case 'create':
      return { ...args, data: { ...(args.data as Record<string, unknown>), tenantId } };
    case 'createMany':
      if (Array.isArray(args.data)) {
        return {
          ...args,
          data: (args.data as Record<string, unknown>[]).map((d) => ({ ...d, tenantId })),
        };
      }
      return args;
    case 'update':
    case 'updateMany':
    case 'delete':
    case 'deleteMany':
    case 'findMany':
    case 'findFirst':
    case 'findFirstOrThrow':
    case 'count':
    case 'aggregate':
    case 'groupBy':
      return mergeWhere(args, tenantId);
    case 'upsert':
      return {
        ...args,
        where: { ...(args.where as Record<string, unknown>), tenantId },
        create: { ...(args.create as Record<string, unknown>), tenantId },
      };
    default:
      return args;
  }
}

export function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

export interface TenantExtensionOptions {
  /** Returns the current tenantId from AsyncLocalStorage or request context. */
  getTenantId: () => string | undefined;
  /** Model names that should skip tenant injection (e.g. global tables). */
  skipModels?: Set<string>;
  /**
   * Fail-closed (RR-H2): when true (the default), a tenant-scoped model
   * operation with no tenantId in context throws {@link TenantContextError}
   * instead of running unscoped. Set `false` (or env
   * `NEXUS_TENANT_ENFORCEMENT=off`) only as an emergency rollback to the legacy
   * fail-open behavior; doing so re-opens the cross-tenant leak this guards.
   */
  failClosed?: boolean;
}

/**
 * Creates a Prisma client extension that automatically injects `tenantId`
 * into all queries. Remaps `findUnique` → `findFirst` and
 * `findUniqueOrThrow` → `findFirstOrThrow` so composite unique constraints
 * that include `tenantId` work correctly.
 */
export function createTenantPrismaExtension<T extends PrismaClientLike>(
  base: T,
  opts: TenantExtensionOptions
) {
  const { getTenantId, skipModels = new Set() } = opts;
  // Fail-closed by default (RR-H2). An env kill-switch allows an operator to
  // revert the whole fleet to the legacy fail-open behavior without a code
  // change if enforcement ever regresses in production.
  const envOff = /^(off|open|false|0|disabled)$/i.test(
    process.env.NEXUS_TENANT_ENFORCEMENT ?? ''
  );
  const failClosed = opts.failClosed ?? !envOff;
  // Merge caller allowlist with the always-tenant-less defaults.
  const skip = new Set<string>([...DEFAULT_SKIP_TENANT_MODELS, ...skipModels]);

  return {
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string;
          operation: string;
          args: unknown;
          query: (a: unknown) => Promise<unknown>;
        }) {
          if (skip.has(model)) {
            return query(args);
          }
          const tenantId = getTenantId();
          if (!tenantId) {
            // FAIL CLOSED: never run a tenant-scoped query unscoped. Throwing
            // surfaces the missing-context bug instead of leaking across tenants.
            if (failClosed) {
              throw new TenantContextError(model, operation);
            }
            return query(args);
          }

          const d = (base as unknown as Record<string, unknown>)[delegateName(model) as string] as {
            findFirst?: (a: unknown) => Promise<unknown>;
            findFirstOrThrow?: (a: unknown) => Promise<unknown>;
          };

          if (operation === 'findUnique' && d.findFirst) {
            return d.findFirst(mergeWhere(args as Record<string, unknown>, tenantId));
          }
          if (operation === 'findUniqueOrThrow' && d.findFirstOrThrow) {
            return d.findFirstOrThrow(mergeWhere(args as Record<string, unknown>, tenantId));
          }

          return query(applyTenantArgs(operation, args as Record<string, unknown>, tenantId));
        },
      },
    },
  };
}
