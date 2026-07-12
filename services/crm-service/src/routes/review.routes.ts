import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, checkPermission, ValidationError } from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import { z } from 'zod';
import type { Prisma } from '../../../../node_modules/.prisma/crm-client/index.js';
import type { CrmPrisma } from '../prisma.js';
import { createAccountsService } from '../services/accounts.service.js';
import { createContactsService } from '../services/contacts.service.js';
import { createDealsService } from '../services/deals.service.js';

const IdParam = z.object({ id: z.string().cuid() });

// Modules the review process (and the apply-on-approve path) supports.
const REVIEW_MODULES = ['account', 'contact', 'deal'] as const;
type ReviewModule = (typeof REVIEW_MODULES)[number];
const ReviewModuleEnum = z.enum(REVIEW_MODULES);

const MODULE_UPDATE_PERMISSION: Record<ReviewModule, string> = {
  account: PERMISSIONS.ACCOUNTS.UPDATE,
  contact: PERMISSIONS.CONTACTS.UPDATE,
  deal: PERMISSIONS.DEALS.UPDATE,
};

const ConfigBody = z.object({
  module: ReviewModuleEnum,
  fields: z.array(z.string().min(1).max(120)).min(1),
  isActive: z.boolean().optional(),
});

const ConfigPatchBody = z
  .object({
    fields: z.array(z.string().min(1).max(120)).min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((b) => b.fields !== undefined || b.isActive !== undefined, {
    message: 'At least one of fields / isActive is required',
  });

const SubmitBody = z.object({
  module: ReviewModuleEnum,
  recordId: z.string().cuid(),
  changes: z.record(z.unknown()),
});

const RejectBody = z.object({ comment: z.string().max(2000).optional() });
const ApproveBody = z.object({ comment: z.string().max(2000).optional() });

/**
 * `/api/v1/review/*` — maker-checker Review Process.
 *
 * Admins define, per module, which fields are review-gated (ReviewProcessConfig).
 * Edits to gated fields are diverted into a PENDING PendingChange (see
 * {@link interceptForReview}, wired into the account/contact/deal update routes,
 * and the explicit `POST /review/submit` here). A reviewer approves — which
 * applies the held change to the real record via the entity service — or rejects.
 */
export async function registerReviewRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const accounts = createAccountsService(prisma, producer);
  const contacts = createContactsService(prisma, producer);
  const deals = createDealsService(prisma, producer);

  /**
   * Apply an approved change to the real record via the owning entity service.
   * Roles are passed as `undefined` so the approved payload is never re-stripped
   * by field-level security — the review approval is itself the authorization.
   */
  async function applyApprovedChange(
    tenantId: string,
    module: string,
    recordId: string,
    changes: Record<string, unknown>,
    reviewer: JwtPayload
  ): Promise<unknown> {
    switch (module) {
      case 'account':
        return accounts.updateAccount(tenantId, recordId, changes as never, reviewer.sub, reviewer.email, undefined);
      case 'contact':
        return contacts.updateContact(tenantId, recordId, changes as never, reviewer.sub, reviewer.email, undefined);
      case 'deal':
        return deals.updateDeal(tenantId, recordId, changes as never, { userId: reviewer.sub, userEmail: reviewer.email }, undefined);
      default:
        throw new ValidationError(`Unsupported review module: ${module}`, { module });
    }
  }

  await app.register(
    async (r) => {
      // ─── CONFIG ────────────────────────────────────────────────────────────
      r.get(
        '/review/config',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { module } = request.query as { module?: string };
          const rows = await prisma.reviewProcessConfig.findMany({
            where: { tenantId: jwt.tenantId, ...(module ? { module } : {}) },
            orderBy: { module: 'asc' },
          });
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/review/config',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = ConfigBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const body = parsed.data;
          // One config per (tenant, module): upsert so re-saving is idempotent.
          const existing = await prisma.reviewProcessConfig.findFirst({
            where: { tenantId: jwt.tenantId, module: body.module },
          });
          const data = { fields: body.fields, isActive: body.isActive ?? true };
          const row = existing
            ? await prisma.reviewProcessConfig.update({ where: { id: existing.id }, data })
            : await prisma.reviewProcessConfig.create({ data: { tenantId: jwt.tenantId, module: body.module, ...data } });
          return reply.code(existing ? 200 : 201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/review/config/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = ConfigPatchBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const existing = await prisma.reviewProcessConfig.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          const updated = await prisma.reviewProcessConfig.update({ where: { id }, data: parsed.data });
          return reply.send({ success: true, data: updated });
        }
      );

      r.delete(
        '/review/config/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const existing = await prisma.reviewProcessConfig.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          await prisma.reviewProcessConfig.delete({ where: { id } });
          return reply.send({ success: true });
        }
      );

      // ─── SUBMIT ────────────────────────────────────────────────────────────
      // Records a PendingChange directly (the explicit maker path). Gated by the
      // module's *:update permission — a submitter must be able to edit the module.
      r.post('/review/submit', async (request, reply) => {
        const parsed = SubmitBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const body = parsed.data;
        const perm = MODULE_UPDATE_PERMISSION[body.module];
        if (!checkPermission(jwt.permissions ?? [], perm)) {
          return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: `Permission required: ${perm}`, requestId: request.id } });
        }
        const pending = await prisma.pendingChange.create({
          data: {
            tenantId: jwt.tenantId,
            module: body.module,
            recordId: body.recordId,
            submittedById: jwt.sub,
            changes: body.changes as Prisma.InputJsonValue,
            status: 'PENDING',
          },
        });
        return reply.code(201).send({ success: true, data: pending });
      });

      // ─── PENDING LIST ──────────────────────────────────────────────────────
      r.get(
        '/review/pending',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { module, status } = request.query as { module?: string; status?: string };
          const rows = await prisma.pendingChange.findMany({
            where: {
              tenantId: jwt.tenantId,
              status: status === 'APPROVED' || status === 'REJECTED' ? status : 'PENDING',
              ...(module ? { module } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
          });
          return reply.send({ success: true, data: rows });
        }
      );

      // ─── APPROVE ───────────────────────────────────────────────────────────
      r.post(
        '/review/:id/approve',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = ApproveBody.safeParse(request.body ?? {});
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const pending = await prisma.pendingChange.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!pending) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          if (pending.status !== 'PENDING') {
            return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: `Already ${pending.status}`, requestId: request.id } });
          }

          // Apply the held change to the real record, then mark APPROVED.
          const applied = await applyApprovedChange(
            jwt.tenantId,
            pending.module,
            pending.recordId,
            (pending.changes ?? {}) as Record<string, unknown>,
            jwt
          );
          const updated = await prisma.pendingChange.update({
            where: { id },
            data: {
              status: 'APPROVED',
              reviewedById: jwt.sub,
              reviewedAt: new Date(),
              reviewerComment: parsed.data.comment ?? null,
            },
          });
          return reply.send({ success: true, data: { pendingChange: updated, record: applied } });
        }
      );

      // ─── REJECT ────────────────────────────────────────────────────────────
      r.post(
        '/review/:id/reject',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = RejectBody.safeParse(request.body ?? {});
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const pending = await prisma.pendingChange.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!pending) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          if (pending.status !== 'PENDING') {
            return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: `Already ${pending.status}`, requestId: request.id } });
          }
          const updated = await prisma.pendingChange.update({
            where: { id },
            data: {
              status: 'REJECTED',
              reviewedById: jwt.sub,
              reviewedAt: new Date(),
              reviewerComment: parsed.data.comment ?? null,
            },
          });
          return reply.send({ success: true, data: updated });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
