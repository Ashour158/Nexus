import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { NexusProducer, TOPICS } from '@nexus/kafka';
import { z } from 'zod';
import type { CrmPrisma } from '../prisma.js';
import { assignForRule, type AssignmentModule } from '../lib/assignment.js';
import { loadRecordForAccess, type SharingModule } from '../lib/sharing.js';

const IdParam = z.object({ id: z.string().cuid() });
const ModuleEnum = z.enum(['lead', 'deal', 'account', 'contact']);
const StrategyEnum = z.enum(['ROUND_ROBIN', 'LOAD_BALANCED', 'CRITERIA']);

const CreateBody = z.object({
  module: ModuleEnum,
  name: z.string().min(1).max(120),
  strategy: StrategyEnum,
  criteria: z.record(z.unknown()).optional(),
  assigneePool: z.array(z.string().cuid()).min(1).max(200),
  isActive: z.boolean().optional(),
});
const UpdateBody = z
  .object({
    name: z.string().min(1).max(120).optional(),
    strategy: StrategyEnum.optional(),
    criteria: z.record(z.unknown()).nullable().optional(),
    assigneePool: z.array(z.string().cuid()).min(1).max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Empty update' });

const ApplyBody = z.object({
  recordId: z.string().cuid(),
  module: ModuleEnum.optional(),
});

const TOPIC_BY_MODULE: Record<AssignmentModule, string> = {
  lead: TOPICS.LEADS,
  deal: TOPICS.DEALS,
  account: TOPICS.ACCOUNTS,
  contact: TOPICS.CONTACTS,
};

/** Reassign a record's owner in the correct module table (tenant-scoped). */
async function updateOwner(
  prisma: CrmPrisma,
  tenantId: string,
  module: AssignmentModule,
  recordId: string,
  ownerId: string
): Promise<number> {
  const where = { id: recordId, tenantId };
  switch (module) {
    case 'lead':
      return (await prisma.lead.updateMany({ where, data: { ownerId } })).count;
    case 'deal':
      return (await prisma.deal.updateMany({ where, data: { ownerId } })).count;
    case 'account':
      return (await prisma.account.updateMany({ where, data: { ownerId } })).count;
    case 'contact':
      return (await prisma.contact.updateMany({ where, data: { ownerId } })).count;
    default:
      return 0;
  }
}

/**
 * `/api/v1/assignment-rules/*` — admin CRUD for Assignment Rules (Zoho
 * "Assignment Rules": round-robin / load-balanced / criteria owner assignment)
 * plus `POST /:id/apply` to reassign an existing record. New records with no
 * explicit owner are auto-assigned at create time via {@link resolveAssignee}
 * (wired into the lead/deal create paths).
 */
export async function registerAssignmentRulesRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/assignment-rules',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { module } = request.query as { module?: string };
          const rows = await prisma.assignmentRule.findMany({
            where: { tenantId: jwt.tenantId, ...(module ? { module } : {}) },
            orderBy: [{ module: 'asc' }, { createdAt: 'asc' }],
          });
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/assignment-rules',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreateBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const b = parsed.data;
          const row = await prisma.assignmentRule.create({
            data: {
              tenantId: jwt.tenantId,
              module: b.module,
              name: b.name,
              strategy: b.strategy,
              criteria: (b.criteria ?? undefined) as never,
              assigneePool: b.assigneePool,
              isActive: b.isActive ?? true,
            },
          });
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/assignment-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = UpdateBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const existing = await prisma.assignmentRule.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          const { criteria, ...rest } = parsed.data;
          const row = await prisma.assignmentRule.update({
            where: { id },
            data: { ...rest, ...(criteria !== undefined ? { criteria: (criteria ?? undefined) as never } : {}) },
          });
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/assignment-rules/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const existing = await prisma.assignmentRule.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          await prisma.assignmentRule.delete({ where: { id } });
          return reply.send({ success: true });
        }
      );

      // ─── APPLY: reassign an existing record via a specific rule ──────────
      r.post(
        '/assignment-rules/:id/apply',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = ApplyBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());

          const rule = await prisma.assignmentRule.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!rule) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Assignment rule not found', requestId: request.id } });

          const module = rule.module as AssignmentModule;
          if (parsed.data.module && parsed.data.module !== module) {
            throw new ValidationError('module does not match the rule', { ruleModule: module });
          }

          const record = await loadRecordForAccess(prisma, jwt.tenantId, module as SharingModule, parsed.data.recordId);
          if (!record) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found', requestId: request.id } });

          const previousOwnerId = record.ownerId ?? null;
          const newOwnerId = await assignForRule(prisma, jwt.tenantId, module, id, record as Record<string, unknown>);
          if (!newOwnerId) {
            return reply.code(200).send({ success: true, data: { reassigned: false, ownerId: previousOwnerId } });
          }

          const count = await updateOwner(prisma, jwt.tenantId, module, parsed.data.recordId, newOwnerId);
          if (count === 0) {
            return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found', requestId: request.id } });
          }

          if (newOwnerId !== previousOwnerId) {
            await producer
              .publish(TOPIC_BY_MODULE[module], {
                type: 'record.reassigned',
                tenantId: jwt.tenantId,
                payload: {
                  module,
                  recordId: parsed.data.recordId,
                  previousOwnerId,
                  newOwnerId,
                  ruleId: id,
                  reassignedBy: jwt.sub,
                },
              })
              .catch((err) => {
                // Event publishing is best-effort; never fail the reassignment.
                // eslint-disable-next-line no-console
                console.warn('[assignment-rules] failed to publish record.reassigned', err);
              });
          }

          return reply.send({ success: true, data: { reassigned: newOwnerId !== previousOwnerId, ownerId: newOwnerId, previousOwnerId } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
