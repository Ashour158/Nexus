import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { z } from 'zod';
import type { CrmPrisma } from '../prisma.js';

const IdParam = z.object({ id: z.string().cuid() });

const ModuleEnum = z.enum(['account', 'contact', 'deal', 'lead']);
const OwdAccessEnum = z.enum(['PRIVATE', 'PUBLIC_READ', 'PUBLIC_READ_WRITE']);
const RuleAccessEnum = z.enum(['READ', 'READ_WRITE']);
const SourceTargetTypeEnum = z.enum(['ROLE', 'GROUP', 'TERRITORY', 'OWNER', 'USER']);

const UpsertOrgDefaultBody = z.object({
  module: ModuleEnum,
  accessLevel: OwdAccessEnum,
  grantHierarchyAccess: z.boolean().optional(),
});
const UpdateOrgDefaultBody = z
  .object({
    accessLevel: OwdAccessEnum.optional(),
    grantHierarchyAccess: z.boolean().optional(),
  })
  .refine((b) => b.accessLevel !== undefined || b.grantHierarchyAccess !== undefined, {
    message: 'At least one of accessLevel / grantHierarchyAccess is required',
  });

const CreateRuleBody = z.object({
  module: ModuleEnum,
  name: z.string().min(1).max(120),
  sourceType: SourceTargetTypeEnum,
  sourceValue: z.string().min(1).max(120),
  targetType: SourceTargetTypeEnum,
  targetValue: z.string().min(1).max(120),
  accessLevel: RuleAccessEnum,
  isActive: z.boolean().optional(),
});
const UpdateRuleBody = z
  .object({
    name: z.string().min(1).max(120).optional(),
    sourceType: SourceTargetTypeEnum.optional(),
    sourceValue: z.string().min(1).max(120).optional(),
    targetType: SourceTargetTypeEnum.optional(),
    targetValue: z.string().min(1).max(120).optional(),
    accessLevel: RuleAccessEnum.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Empty update' });

const CreateManualShareBody = z.object({
  module: ModuleEnum,
  recordId: z.string().cuid(),
  granteeType: z.enum(['USER', 'ROLE']),
  granteeId: z.string().min(1).max(120),
  accessLevel: RuleAccessEnum,
});

function notFound(reply: import('fastify').FastifyReply, requestId: string) {
  return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId } });
}

/**
 * `/api/v1/sharing/*` — admin CRUD for Org-Wide Defaults, Sharing Rules, and
 * Manual Sharing (Zoho "Data Sharing Settings"). Enforcement lives in
 * {@link canAccessRecord} (lib/sharing.ts), wired into the accounts / contacts /
 * deals record read + PATCH paths. Everything here is OPT-IN: a tenant with no
 * OrgWideDefault and no SharingRule rows is entirely unaffected.
 */
export async function registerSharingRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  await app.register(
    async (r) => {
      // ─── Org-Wide Defaults ──────────────────────────────────────────────
      r.get(
        '/sharing/org-defaults',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const rows = await prisma.orgWideDefault.findMany({
            where: { tenantId: jwt.tenantId },
            orderBy: { module: 'asc' },
          });
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/sharing/org-defaults',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = UpsertOrgDefaultBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const body = parsed.data;
          // Upsert on the natural key (tenantId, module) so re-configuring is idempotent.
          const existing = await prisma.orgWideDefault.findFirst({
            where: { tenantId: jwt.tenantId, module: body.module },
          });
          const row = existing
            ? await prisma.orgWideDefault.update({
                where: { id: existing.id },
                data: { accessLevel: body.accessLevel, grantHierarchyAccess: body.grantHierarchyAccess ?? existing.grantHierarchyAccess },
              })
            : await prisma.orgWideDefault.create({
                data: {
                  tenantId: jwt.tenantId,
                  module: body.module,
                  accessLevel: body.accessLevel,
                  grantHierarchyAccess: body.grantHierarchyAccess ?? true,
                },
              });
          return reply.code(existing ? 200 : 201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/sharing/org-defaults/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = UpdateOrgDefaultBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const existing = await prisma.orgWideDefault.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) return notFound(reply, request.id);
          const updated = await prisma.orgWideDefault.update({ where: { id }, data: parsed.data });
          return reply.send({ success: true, data: updated });
        }
      );

      r.delete(
        '/sharing/org-defaults/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const existing = await prisma.orgWideDefault.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) return notFound(reply, request.id);
          await prisma.orgWideDefault.delete({ where: { id } });
          return reply.send({ success: true });
        }
      );

      // ─── Sharing Rules ──────────────────────────────────────────────────
      r.get(
        '/sharing/rules',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { module } = request.query as { module?: string };
          const rows = await prisma.sharingRule.findMany({
            where: { tenantId: jwt.tenantId, ...(module ? { module } : {}) },
            orderBy: [{ module: 'asc' }, { createdAt: 'asc' }],
          });
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/sharing/rules',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreateRuleBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const b = parsed.data;
          const row = await prisma.sharingRule.create({
            data: {
              tenantId: jwt.tenantId,
              module: b.module,
              name: b.name,
              sourceType: b.sourceType,
              sourceValue: b.sourceValue,
              targetType: b.targetType,
              targetValue: b.targetValue,
              accessLevel: b.accessLevel,
              isActive: b.isActive ?? true,
            },
          });
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/sharing/rules/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = UpdateRuleBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const existing = await prisma.sharingRule.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) return notFound(reply, request.id);
          const updated = await prisma.sharingRule.update({ where: { id }, data: parsed.data });
          return reply.send({ success: true, data: updated });
        }
      );

      r.delete(
        '/sharing/rules/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const existing = await prisma.sharingRule.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) return notFound(reply, request.id);
          await prisma.sharingRule.delete({ where: { id } });
          return reply.send({ success: true });
        }
      );

      // ─── Manual Sharing ─────────────────────────────────────────────────
      r.get(
        '/sharing/manual',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { module, recordId } = request.query as { module?: string; recordId?: string };
          const rows = await prisma.manualShare.findMany({
            where: { tenantId: jwt.tenantId, ...(module ? { module } : {}), ...(recordId ? { recordId } : {}) },
            orderBy: { createdAt: 'desc' },
          });
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/sharing/manual',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreateManualShareBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const b = parsed.data;
          // Idempotent on (module, recordId, granteeType, granteeId): re-sharing
          // updates the access level instead of stacking duplicate rows.
          const existing = await prisma.manualShare.findFirst({
            where: { tenantId: jwt.tenantId, module: b.module, recordId: b.recordId, granteeType: b.granteeType, granteeId: b.granteeId },
          });
          const row = existing
            ? await prisma.manualShare.update({ where: { id: existing.id }, data: { accessLevel: b.accessLevel } })
            : await prisma.manualShare.create({
                data: {
                  tenantId: jwt.tenantId,
                  module: b.module,
                  recordId: b.recordId,
                  granteeType: b.granteeType,
                  granteeId: b.granteeId,
                  accessLevel: b.accessLevel,
                  createdBy: jwt.sub,
                },
              });
          return reply.code(existing ? 200 : 201).send({ success: true, data: row });
        }
      );

      r.delete(
        '/sharing/manual/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const existing = await prisma.manualShare.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) return notFound(reply, request.id);
          await prisma.manualShare.delete({ where: { id } });
          return reply.send({ success: true });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
