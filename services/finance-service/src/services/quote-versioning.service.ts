// ─── B2: Quote versioning + approval matrix ─────────────────────────────────
// Versioning reuses the existing immutable `QuoteRevision` snapshot table (which
// already records version#, reason, status, full snapshot JSON, createdBy,
// createdAt with @@unique([tenantId, quoteId, version])) rather than adding a
// parallel table. This service adds: an explicit manual-snapshot endpoint, a
// single-version read, a version diff, and a matrix-driven submit-for-approval
// that opens approval requests through approval-service and drives the quote's
// existing multi-level approval fields (requiredApprovalLevel / approvalLevel).

import type { EngineContext } from '@nexus/domain-core';
import { TOPICS, type NexusProducer } from '@nexus/kafka';
import { BusinessRuleError, NotFoundError } from '@nexus/service-utils';
import { Prisma } from '../../../../node_modules/.prisma/finance-client/index.js';
import type { FinancePrisma } from '../prisma.js';
import {
  computeQuoteMetrics,
  createMatrixApprovalRequest,
  evaluateMatrix,
  type ApprovalMatrixRuleShape,
} from '../lib/approval-matrix.js';

function actor(ctx: EngineContext) {
  return ctx.audit.actor;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function jsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

type SnapshotDiffEntry = { field: string; from: unknown; to: unknown };

/** Shallow field-level diff of two version snapshots (scalars) + a line-count note. */
function diffSnapshots(from: Record<string, unknown>, to: Record<string, unknown>): SnapshotDiffEntry[] {
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  const diffs: SnapshotDiffEntry[] = [];
  for (const key of keys) {
    const a = from[key];
    const b = to[key];
    // Compare by JSON so nested arrays/objects (e.g. lineItems) are diffed too.
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
      diffs.push({ field: key, from: a ?? null, to: b ?? null });
    }
  }
  return diffs.sort((x, y) => x.field.localeCompare(y.field));
}

export function createQuoteVersioningService(prisma: FinancePrisma, producer: NexusProducer) {
  async function emit(ctx: EngineContext, type: string, quoteId: string, payload: Record<string, unknown>) {
    const tenantId = actor(ctx).tenantId;
    const eventPayload = {
      type,
      tenantId,
      occurredAt: ctx.now.toISOString(),
      actorId: actor(ctx).userId,
      ...payload,
    };
    await prisma.outboxMessage.create({
      data: {
        topic: TOPICS.QUOTES,
        key: quoteId,
        payload: eventPayload as Prisma.InputJsonValue,
        tenantId,
        aggregateType: 'quote',
        aggregateId: quoteId,
        eventType: type,
        correlationId: ctx.audit.correlationId ?? ctx.audit.requestId ?? type,
        headers: { eventType: type, source: 'finance-service', tenantId, aggregateType: 'quote' } as Prisma.InputJsonValue,
        status: 'PENDING',
        retryCount: 0,
      },
    });
    await producer.publish(TOPICS.QUOTES, { type, tenantId, payload: eventPayload }).catch(() => undefined);
  }

  async function loadQuote(tenantId: string, quoteId: string) {
    const quote = await prisma.quote.findFirst({ where: { id: quoteId, tenantId } });
    if (!quote) throw new NotFoundError('Quote', quoteId);
    return quote;
  }

  /** Builds a full snapshot of the quote plus its normalized line rows. */
  async function buildSnapshot(tenantId: string, quoteId: string, quote: Record<string, unknown>, overrides: Record<string, unknown>) {
    const lines = await prisma.quoteLine.findMany({
      where: { tenantId, quoteId },
      orderBy: { sortOrder: 'asc' },
    });
    return jsonSafe({ ...quote, ...overrides, normalizedLines: lines });
  }

  /** Next collision-safe version number = max(quote.version, latest revision) + 1. */
  async function nextVersion(tenantId: string, quoteId: string, quoteVersion: number): Promise<number> {
    const latest = await prisma.quoteRevision.findFirst({
      where: { tenantId, quoteId },
      orderBy: { version: 'desc' },
    });
    return Math.max(Number(quoteVersion ?? 1), Number(latest?.version ?? 0)) + 1;
  }

  return {
    async listVersions(ctx: EngineContext, quoteId: string) {
      const tenantId = actor(ctx).tenantId;
      await loadQuote(tenantId, quoteId);
      return prisma.quoteRevision.findMany({
        where: { tenantId, quoteId },
        orderBy: { version: 'desc' },
      });
    },

    async getVersion(ctx: EngineContext, quoteId: string, version: number) {
      const tenantId = actor(ctx).tenantId;
      const revision = await prisma.quoteRevision.findFirst({ where: { tenantId, quoteId, version } });
      if (!revision) throw new NotFoundError('QuoteVersion', `${quoteId}#${version}`);
      return revision;
    },

    /**
     * Manual snapshot endpoint (POST /quotes/:id/versions). Records the current
     * quote+lines as a new immutable version and bumps the quote's version so the
     * revision series stays collision-safe with the transition-driven snapshots.
     */
    async snapshotVersion(ctx: EngineContext, quoteId: string, reason: string) {
      const tenantId = actor(ctx).tenantId;
      const quote = await loadQuote(tenantId, quoteId);
      const version = await nextVersion(tenantId, quoteId, Number(quote.version ?? 1));
      const snapshot = await buildSnapshot(tenantId, quoteId, quote as unknown as Record<string, unknown>, { version });

      const revision = await prisma.$transaction(async (tx) => {
        const created = await tx.quoteRevision.create({
          data: {
            tenantId,
            quoteId,
            version,
            reason: reason || 'manual.snapshot',
            status: quote.status,
            snapshot,
            createdById: actor(ctx).userId,
          },
        });
        await tx.quote.update({ where: { id: quoteId }, data: { version } });
        return created;
      });

      await emit(ctx, 'quote.version.snapshotted', quoteId, {
        quoteId,
        version,
        reason: revision.reason,
      });
      return revision;
    },

    async diffVersions(ctx: EngineContext, quoteId: string, fromVersion: number, toVersion: number) {
      const tenantId = actor(ctx).tenantId;
      const [from, to] = await Promise.all([
        prisma.quoteRevision.findFirst({ where: { tenantId, quoteId, version: fromVersion } }),
        prisma.quoteRevision.findFirst({ where: { tenantId, quoteId, version: toVersion } }),
      ]);
      if (!from) throw new NotFoundError('QuoteVersion', `${quoteId}#${fromVersion}`);
      if (!to) throw new NotFoundError('QuoteVersion', `${quoteId}#${toVersion}`);
      const diffs = diffSnapshots(asRecord(from.snapshot), asRecord(to.snapshot));
      return {
        quoteId,
        from: { version: from.version, status: from.status, createdAt: from.createdAt },
        to: { version: to.version, status: to.status, createdAt: to.createdAt },
        changed: diffs,
      };
    },

    /**
     * B2 approval matrix: evaluate ApprovalMatrixRule rows against the quote's
     * discount%/margin%/amount, open an approval request per matched step via
     * approval-service, and drive the quote into PENDING_APPROVAL with
     * requiredApprovalLevel = number of matched steps (cleared level-by-level by
     * the existing `approveQuoteLevel` flow). A snapshot version is recorded.
     */
    async submitForApprovalMatrix(ctx: EngineContext, quoteId: string, quoteReference?: string) {
      const tenantId = actor(ctx).tenantId;
      const quote = await loadQuote(tenantId, quoteId);
      if (quote.status !== 'DRAFT') {
        throw new BusinessRuleError(`Quote cannot be submitted for approval from status ${quote.status}`);
      }

      const metrics = computeQuoteMetrics({
        subtotal: quote.subtotal,
        discountAmount: quote.discountAmount,
        total: quote.total,
        marginTotal: quote.marginTotal,
        currency: quote.currency,
      });

      const rules = (await prisma.approvalMatrixRule.findMany({
        where: { tenantId, object: 'quote', isActive: true },
        orderBy: { level: 'asc' },
      })) as unknown as ApprovalMatrixRuleShape[];
      const steps = evaluateMatrix(rules, metrics);

      if (steps.length === 0) {
        // Nothing in the matrix applies — no approval gate. Leave the quote as-is
        // so the caller can proceed (e.g. straight to send).
        return { requiresApproval: false, quote, metrics, steps: [], approvalRequests: [] as Array<Record<string, unknown>> };
      }

      const reference = quoteReference ?? quote.quoteNumber;
      const approvalRequests: Array<Record<string, unknown>> = [];
      for (const step of steps) {
        const requestId = await createMatrixApprovalRequest(
          tenantId,
          quoteId,
          reference,
          actor(ctx).userId,
          step,
          metrics
        );
        approvalRequests.push({
          ruleId: step.ruleId,
          ruleName: step.ruleName,
          level: step.level,
          approverRole: step.approverRole,
          approverChain: step.approverChain,
          approvalRequestId: requestId ?? null,
        });
      }

      const version = await nextVersion(tenantId, quoteId, Number(quote.version ?? 1));
      const updated = await prisma.$transaction(async (tx) => {
        const q = await tx.quote.update({
          where: { id: quoteId },
          data: {
            status: 'PENDING_APPROVAL',
            approvalRequired: true,
            approvalStatus: 'PENDING',
            requiredApprovalLevel: steps.length,
            approvalLevel: 0,
            version,
            pricingBreakdown: {
              ...asRecord(quote.pricingBreakdown),
              approvalMatrix: { metrics, steps: approvalRequests, submittedAt: ctx.now.toISOString() },
            } as Prisma.InputJsonValue,
          },
        });
        await tx.quoteRevision.create({
          data: {
            tenantId,
            quoteId,
            version,
            reason: 'quote.submitted_for_approval.matrix',
            status: 'PENDING_APPROVAL',
            snapshot: jsonSafe({ ...(quote as unknown as Record<string, unknown>), status: 'PENDING_APPROVAL', version, approvalMatrix: approvalRequests }),
            createdById: actor(ctx).userId,
          },
        });
        return q;
      });

      await emit(ctx, 'quote.submitted_for_approval', quoteId, {
        quoteId,
        previousStatus: quote.status,
        status: 'PENDING_APPROVAL',
        requiredApprovalLevel: steps.length,
        approvalMatrix: approvalRequests,
        metrics,
      });

      return { requiresApproval: true, quote: updated, metrics, steps, approvalRequests };
    },
  };
}

export type QuoteVersioningService = ReturnType<typeof createQuoteVersioningService>;
