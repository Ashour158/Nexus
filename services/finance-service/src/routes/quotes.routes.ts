import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import type { EngineContext } from '@nexus/domain-core';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import {
  CreateQuoteSchema,
  PaginationSchema,
  QuoteListQuerySchema,
  RejectQuoteSchema,
  UpdateQuoteSchema,
  VoidQuoteSchema,
} from '@nexus/validation';
import type { FinancePrisma } from '../prisma.js';
import { checkDiscountApproval } from '../lib/discount-approval.js';
import { createQuotesService } from '../services/quotes.service.js';
import { createDiscountRequestsService } from '../services/discount-requests.service.js';
import { CpqPricingEngine } from '../cpq/pricing-engine.js';
import { createCommercialRecordsUseCase } from '../use-cases/commercial-records.use-case.js';
import { createQuoteVersioningService } from '../services/quote-versioning.service.js';

const DealParamsSchema = z.object({ dealId: z.string().cuid() });
const QuoteIdParamSchema = z.object({ id: z.string().min(1) });
const VersionParamSchema = z.object({ id: z.string().min(1), v: z.coerce.number().int().min(1) });
const SnapshotBodySchema = z.object({ reason: z.string().min(1).optional() });
const DiffQuerySchema = z.object({ against: z.coerce.number().int().min(1) });
const SubmitForApprovalBodySchema = z.object({ quoteReference: z.string().min(1).optional() }).default({});

export async function registerQuotesRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma,
  producer: NexusProducer
): Promise<void> {
  const quotes = createQuotesService(prisma, producer);
  const discountRequests = createDiscountRequestsService(prisma, producer);
  const engine = new CpqPricingEngine(prisma);
  const commercial = createCommercialRecordsUseCase({
    prisma,
    producer,
    quotes,
    discountRequests,
    pricingEngine: engine,
    checkDiscountApproval,
  });
  const versioning = createQuoteVersioningService(prisma, producer);

  function engineContextFromJwt(requestId: string, jwt: JwtPayload, correlationId?: string): EngineContext {
    return {
      audit: {
        actor: {
          userId: jwt.sub,
          tenantId: jwt.tenantId,
          email: jwt.email,
          roles: jwt.roles ?? [],
          permissions: jwt.permissions ?? [],
        },
        requestId,
        correlationId,
        source: 'api',
      },
      now: new Date(),
    };
  }

  function transitionMeta(request: { headers: Record<string, unknown>; id: string }) {
    const idempotencyKey =
      String(request.headers['idempotency-key'] ?? '').trim() ||
      String(request.headers['x-idempotency-key'] ?? '').trim() ||
      request.id;
    const correlationId =
      String(request.headers['x-correlation-id'] ?? '').trim() ||
      String(request.headers['x-request-id'] ?? '').trim() ||
      request.id;
    return { idempotencyKey, correlationId, source: 'api' };
  }

  await app.register(
    async (r) => {
      // ─── ADMIN: quote-number config (admin-controlled auto numbering) ────
      r.get('/quotes/config/numbering', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const cfg = await prisma.quoteNumberConfig.upsert({
          where: { tenantId: jwt.tenantId },
          update: {},
          create: { tenantId: jwt.tenantId },
        });
        return reply.send({ success: true, data: cfg });
      });
      r.put('/quotes/config/numbering', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const b = (request.body ?? {}) as Record<string, unknown>;
        const data: Record<string, unknown> = {};
        if (typeof b.prefix === 'string') data.prefix = b.prefix.trim().slice(0, 12) || 'QUO';
        if (typeof b.separator === 'string') data.separator = b.separator.slice(0, 3);
        if (typeof b.includeYear === 'boolean') data.includeYear = b.includeYear;
        if (typeof b.padding === 'number') data.padding = Math.min(10, Math.max(1, Math.floor(b.padding)));
        if (typeof b.resetYearly === 'boolean') data.resetYearly = b.resetYearly;
        if (typeof b.nextSequence === 'number' && b.nextSequence >= 1) data.nextSequence = Math.floor(b.nextSequence);
        const cfg = await prisma.quoteNumberConfig.upsert({
          where: { tenantId: jwt.tenantId },
          update: data,
          create: { tenantId: jwt.tenantId, ...data },
        });
        return reply.send({ success: true, data: cfg });
      });

      // ─── ADMIN: multi-level approval tiers ──────────────────────────────
      r.get('/quotes/config/approval-tiers', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const tiers = await prisma.quoteApprovalTier.findMany({ where: { tenantId: jwt.tenantId }, orderBy: { level: 'asc' } });
        return reply.send({ success: true, data: tiers });
      });
      r.post('/quotes/config/approval-tiers', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const b = (request.body ?? {}) as Record<string, unknown>;
        const name = String(b.name ?? '').trim();
        const level = Number(b.level);
        if (!name || !Number.isFinite(level) || level < 1) {
          return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name and level (>=1) are required', requestId: request.id } });
        }
        if (b.minAmount == null && b.minDiscountPercent == null) {
          return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'a tier needs at least one threshold (minAmount or minDiscountPercent)', requestId: request.id } });
        }
        const tier = await prisma.quoteApprovalTier.create({
          data: {
            tenantId: jwt.tenantId,
            name,
            level: Math.floor(level),
            minAmount: b.minAmount != null ? String(b.minAmount) : null,
            minDiscountPercent: b.minDiscountPercent != null ? String(b.minDiscountPercent) : null,
            approverRole: b.approverRole != null ? String(b.approverRole) : null,
            isActive: b.isActive != null ? Boolean(b.isActive) : true,
          },
        });
        return reply.code(201).send({ success: true, data: tier });
      });
      r.delete('/quotes/config/approval-tiers/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { id } = request.params as { id: string };
        await prisma.quoteApprovalTier.deleteMany({ where: { id, tenantId: jwt.tenantId } });
        return reply.send({ success: true });
      });

      // ─── B2 ADMIN: approval matrix rules (discount%/margin%/amount) ──────
      r.get('/quotes/config/approval-matrix', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rules = await prisma.approvalMatrixRule.findMany({
          where: { tenantId: jwt.tenantId, object: 'quote' },
          orderBy: { level: 'asc' },
        });
        return reply.send({ success: true, data: rules });
      });
      r.post('/quotes/config/approval-matrix', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const b = (request.body ?? {}) as Record<string, unknown>;
        const name = String(b.name ?? '').trim();
        const condition = b.condition && typeof b.condition === 'object' && !Array.isArray(b.condition) ? (b.condition as Record<string, unknown>) : {};
        if (!name || Object.keys(condition).length === 0) {
          return reply.code(422).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name and a non-empty condition are required', requestId: request.id } });
        }
        const rule = await prisma.approvalMatrixRule.create({
          data: {
            tenantId: jwt.tenantId,
            object: 'quote',
            name,
            level: Number.isFinite(Number(b.level)) && Number(b.level) >= 1 ? Math.floor(Number(b.level)) : 1,
            condition: condition as never,
            approverChain: Array.isArray(b.approverChain) ? (b.approverChain as never) : ([] as never),
            approverRole: b.approverRole != null ? String(b.approverRole) : null,
            isActive: b.isActive != null ? Boolean(b.isActive) : true,
          },
        });
        return reply.code(201).send({ success: true, data: rule });
      });
      r.delete('/quotes/config/approval-matrix/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { id } = request.params as { id: string };
        await prisma.approvalMatrixRule.deleteMany({ where: { id, tenantId: jwt.tenantId } });
        return reply.send({ success: true });
      });

      // ─── LIST ───────────────────────────────────────────────────────────
      r.get(
        '/quotes',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const parsed = QuoteListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const result = await commercial.listQuotes(engineContextFromJwt(request.id, jwt), parsed.data);
          return reply.send({ success: true, data: result });
        }
      );

      // ─── LIST ARCHIVED ──────────────────────────────────────────────────
      // Terminal quotes (expired / voided / superseded) excluded from the hot
      // list above. Paginated, tenant-scoped, permission-guarded.
      r.get(
        '/quotes/archived',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const parsed = QuoteListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const result = await commercial.listArchivedQuotes(engineContextFromJwt(request.id, jwt), parsed.data);
          return reply.send({ success: true, data: result });
        }
      );

      // ─── RESTORE (un-archive) ───────────────────────────────────────────
      r.post(
        '/quotes/:id/restore',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { id } = QuoteIdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const quote = await commercial.restoreQuote(engineContextFromJwt(request.id, jwt), id);
          return reply.send({ success: true, data: quote });
        }
      );

      // ─── CREATE (runs CPQ engine, persists quote) ───────────────────────
      r.post(
        '/quotes',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.CREATE) },
        async (request, reply) => {
          const parsed = CreateQuoteSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const data = await commercial.createQuote(engineContextFromJwt(request.id, jwt), parsed.data);
          return reply.code(201).send({
            success: true,
            data,
          });
        }
      );

      // ─── READ ───────────────────────────────────────────────────────────
      r.get(
        '/quotes/:id',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const { id } = QuoteIdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const quote = await commercial.getQuote(engineContextFromJwt(request.id, jwt), id);
          return reply.send({ success: true, data: quote });
        }
      );

      // ─── UPDATE ─────────────────────────────────────────────────────────
      r.patch(
        '/quotes/:id',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { id } = QuoteIdParamSchema.parse(request.params);
          const parsed = UpdateQuoteSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const result = await commercial.updateQuote(engineContextFromJwt(request.id, jwt), id, parsed.data);
          if (result.requiresApproval) {
            return reply.code(202).send({
              success: true,
              meta: { requiresApproval: true, approvalRequestId: result.approval.requestId },
              data: result.approval,
              message: result.message,
            });
          }
          return reply.send({ success: true, data: result.quote });
        }
      );

      // ─── SEND ───────────────────────────────────────────────────────────
      r.post(
        '/quotes/:id/send',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.SEND) },
        async (request, reply) => {
          const { id } = QuoteIdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const meta = transitionMeta(request);
          const quote = await commercial.sendQuote(engineContextFromJwt(request.id, jwt, meta.correlationId), id, meta);
          return reply.send({ success: true, data: quote });
        }
      );

      // ─── APPROVE (level-aware manager approval) ─────────────────────────
      r.post(
        '/quotes/:id/approve',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.APPROVE) },
        async (request, reply) => {
          const { id } = QuoteIdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const quote = await commercial.approveQuoteLevel(engineContextFromJwt(request.id, jwt), id);
          return reply.send({ success: true, data: quote });
        }
      );

      // ─── ACCEPT ─────────────────────────────────────────────────────────
      r.post(
        '/quotes/:id/accept',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { id } = QuoteIdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const meta = transitionMeta(request);
          const quote = await commercial.acceptQuote(engineContextFromJwt(request.id, jwt, meta.correlationId), id, meta);
          return reply.send({ success: true, data: quote });
        }
      );

      // ─── REJECT ─────────────────────────────────────────────────────────
      r.post(
        '/quotes/:id/reject',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { id } = QuoteIdParamSchema.parse(request.params);
          const parsed = RejectQuoteSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const meta = transitionMeta(request);
          const quote = await commercial.rejectQuote(engineContextFromJwt(request.id, jwt, meta.correlationId), id, parsed.data.reason, meta);
          return reply.send({ success: true, data: quote });
        }
      );

      // ─── DUPLICATE ──────────────────────────────────────────────────────
      r.post(
        '/quotes/:id/duplicate',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.CREATE) },
        async (request, reply) => {
          const { id } = QuoteIdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const quote = await commercial.duplicateQuote(engineContextFromJwt(request.id, jwt), id);
          return reply.code(201).send({ success: true, data: quote });
        }
      );

      // ─── VOID ───────────────────────────────────────────────────────────
      r.post(
        '/quotes/:id/void',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { id } = QuoteIdParamSchema.parse(request.params);
          const parsed = VoidQuoteSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const meta = transitionMeta(request);
          const quote = await commercial.voidQuote(engineContextFromJwt(request.id, jwt, meta.correlationId), id, parsed.data.reason, meta);
          return reply.send({ success: true, data: quote });
        }
      );

      // ─── B2: VERSIONS (immutable snapshots via QuoteRevision) ───────────
      r.get(
        '/quotes/:id/versions',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const { id } = QuoteIdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const rows = await versioning.listVersions(engineContextFromJwt(request.id, jwt), id);
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/quotes/:id/versions',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { id } = QuoteIdParamSchema.parse(request.params);
          const body = SnapshotBodySchema.parse(request.body ?? {});
          const jwt = request.user as JwtPayload;
          const revision = await versioning.snapshotVersion(engineContextFromJwt(request.id, jwt), id, body.reason ?? 'manual.snapshot');
          return reply.code(201).send({ success: true, data: revision });
        }
      );

      // Diff must be registered before `/versions/:v` so `/versions/:v/diff`
      // isn't shadowed (Fastify matches static segments fine, but keep explicit).
      r.get(
        '/quotes/:id/versions/:v/diff',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const { id, v } = VersionParamSchema.parse(request.params);
          const { against } = DiffQuerySchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const diff = await versioning.diffVersions(engineContextFromJwt(request.id, jwt), id, v, against);
          return reply.send({ success: true, data: diff });
        }
      );

      r.get(
        '/quotes/:id/versions/:v',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const { id, v } = VersionParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const revision = await versioning.getVersion(engineContextFromJwt(request.id, jwt), id, v);
          return reply.send({ success: true, data: revision });
        }
      );

      // ─── B2: SUBMIT FOR APPROVAL (matrix-driven) ────────────────────────
      r.post(
        '/quotes/:id/submit-for-approval',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const { id } = QuoteIdParamSchema.parse(request.params);
          const body = SubmitForApprovalBodySchema.parse(request.body ?? {});
          const jwt = request.user as JwtPayload;
          const result = await versioning.submitForApprovalMatrix(engineContextFromJwt(request.id, jwt), id, body.quoteReference);
          const code = result.requiresApproval ? 202 : 200;
          return reply.code(code).send({
            success: true,
            meta: { requiresApproval: result.requiresApproval },
            data: result,
          });
        }
      );

      // ─── QUOTES FOR DEAL ────────────────────────────────────────────────
      r.get(
        '/deals/:dealId/quotes',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.READ) },
        async (request, reply) => {
          const { dealId } = DealParamsSchema.parse(request.params);
          const q = PaginationSchema.parse(request.query);
          const jwt = request.user as JwtPayload;
          const result = await commercial.listDealQuotes(engineContextFromJwt(request.id, jwt), dealId, q);
          return reply.send({ success: true, data: result });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
