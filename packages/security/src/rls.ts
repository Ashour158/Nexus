/**
 * Row-Level Security (RLS) for PostgreSQL via Prisma middleware.
 *
 * Usage:
 *   import { withRls, runWithRls } from '@nexus/security/rls';
 *   const prisma = new PrismaClient();
 *   withRls(prisma);
 *   await runWithRls({ tenantId: 'tenant-123', userId: 'user-456' }, async () => {
 *     // all Prisma queries in this scope are RLS-scoped
 *   });
 */

/**
 * Minimal structural type for the Prisma surface this module actually uses.
 *
 * Deliberately NOT `import type { PrismaClient } from '@prisma/client'`: every
 * service in this monorepo generates its client to its own output path
 * (`node_modules/.prisma/<service>-client`), so the bare `@prisma/client`
 * package has no generated `default.d.ts` and exports no `PrismaClient` type.
 * That import therefore never resolved — it failed the ROOT typecheck, which
 * failed the root build, which is why CI could not gate anything.
 *
 * A structural type is also the right coupling for a shared package: it accepts
 * ANY service's generated client instead of privileging one that doesn't exist.
 */
interface PrismaClientLike {
  $use(
    middleware: (params: any, next: (params: any) => Promise<unknown>) => Promise<unknown>
  ): void;
}
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RlsContext {
  tenantId: string;
  userId: string;
  roles?: string[];
}

const rlsStorage = new AsyncLocalStorage<RlsContext>();

export function getRlsContext(): RlsContext | undefined {
  return rlsStorage.getStore();
}

/** @deprecated Use runWithRls instead */
export function setRlsContext(ctx: RlsContext): void {
  rlsStorage.enterWith(ctx);
}

/** @deprecated No-op with AsyncLocalStorage; context is scoped automatically */
export function clearRlsContext(): void {
  // No-op: AsyncLocalStorage contexts are automatically cleaned up
}

/** Execute a function within an RLS-bound async context. */
export function runWithRls<T>(ctx: RlsContext, fn: () => Promise<T>): Promise<T> {
  return rlsStorage.run(ctx, fn);
}

/** Prisma middleware that injects RLS WHERE clauses for tenant isolation. */
export function withRls(prisma: PrismaClientLike): void {

  prisma.$use(async (params: any, next: (params: any) => Promise<unknown>) => {
    const rls = getRlsContext();
    if (!rls) return next(params);

    const rlsModels = [
      'Contact', 'Deal', 'Activity', 'Company', 'Task', 'Note',
      'Lead', 'Account', 'Quote', 'Pipeline', 'Stage', 'Attachment',
      'EmailThread', 'EmailMessage', 'ConsentRecord', 'CustomFieldDefinition',
      'FieldChangeLog', 'WinLossReason', 'FieldPermission', 'ValidationRule',
      'DuplicateGroup', 'DuplicateRecord', 'LeadScore', 'AccountHealthScore',
      'LeadScoringRule', 'EnrichmentJob', 'Competitor', 'DealCompetitor',
      'Territory', 'SalesRep', 'LeadRoutingEvent', 'MutualActionItem',
      'DealRoom', 'DealRoomDocument', 'DealContact', 'DealStakeholder',
      'Tenant', 'User', 'Role', 'UserRole', 'Session', 'ApiKey', 'AuditLog',
      'UserProfile', 'GdprErasureRequest', 'SsoConfiguration',
      'Notification', 'ApprovalPolicy', 'ApprovalRequest', 'ApprovalStep',
      'WorkflowTemplate', 'WorkflowExecution', 'WorkflowStep', 'WorkflowForkTracker',
      'EmailTemplate', 'SmsTemplate', 'EmailSequence', 'SequenceStep', 'SequenceEnrollment',
      'WhatsAppMessage', 'OutboxMessage'
    ];
    if (rlsModels.includes(params.model ?? '') && ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy'].includes(params.action)) {
      params.args = { ...params.args, where: { ...params.args?.where, tenantId: rls.tenantId } };
    }

    if (rlsModels.includes(params.model ?? '') && ['create', 'createMany', 'upsert'].includes(params.action)) {
      if (params.args.data) {
        if (Array.isArray(params.args.data)) {
          params.args = { ...params.args, data: params.args.data.map((d: Record<string, unknown>) => ({ ...d, tenantId: rls.tenantId })) };
        } else {
          params.args = { ...params.args, data: { ...params.args.data, tenantId: rls.tenantId } };
        }
      }
    }

    if (rlsModels.includes(params.model ?? '') && ['update', 'updateMany', 'delete', 'deleteMany'].includes(params.action)) {
      params.args = { ...params.args, where: { ...params.args?.where, tenantId: rls.tenantId } };
    }

    return next(params);
  });
}

/** Validates and escapes an identifier for use in a PostgreSQL string literal. */
function escapePgStringLiteral(value: string): string {
  // Reject characters that could enable statement injection or escape sequences
  if (/[\0\n\r;\x1a]/.test(value)) {
    throw new Error('Invalid characters in RLS context value');
  }
  // Standard SQL escaping: double single quotes
  return value.replace(/'/g, "''");
}

/** Raw SQL wrapper that sets PostgreSQL RLS session variables.
 *  Returns an array of single-statement SQL strings.
 *  Consumers must execute each statement separately (Prisma $executeRaw
 *  does not support multiple statements in one call).
 */
export function buildRlsSessionSql(ctx: RlsContext): string[] {
  const safeTenantId = escapePgStringLiteral(ctx.tenantId);
  const safeUserId = escapePgStringLiteral(ctx.userId);
  return [
    `SET LOCAL app.current_tenant_id = '${safeTenantId}';`,
    `SET LOCAL app.current_user_id = '${safeUserId}';`,
  ];
}
