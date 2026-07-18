import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { z } from 'zod';
import type { CrmPrisma } from '../prisma.js';

const IdParam = z.object({ id: z.string().cuid() });

const CreateFieldPermissionBody = z.object({
  module: z.string().min(1).max(40),
  field: z.string().min(1).max(120),
  roleName: z.string().min(1).max(80),
  canRead: z.boolean().optional(),
  canEdit: z.boolean().optional(),
});

const UpdateFieldPermissionBody = z
  .object({
    canRead: z.boolean().optional(),
    canEdit: z.boolean().optional(),
  })
  .refine((b) => b.canRead !== undefined || b.canEdit !== undefined, {
    message: 'At least one of canRead / canEdit is required',
  });

/**
 * `/api/v1/field-permissions` — admin CRUD for Field-Level Security.
 *
 * Each row is one (module, field, roleName) grant of canRead / canEdit. Absence
 * of a matching row is DEFAULT-ALLOW, so a tenant with no rows is unaffected.
 * Enforcement lives in {@link maskFieldPermissions} (read) and
 * {@link applyFieldPermissions} (write) in `lib/write-guards.ts`, already wired
 * into the accounts / contacts / deals / leads read + update paths.
 */
export async function registerFieldPermissionsRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/field-permissions',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { module, roleName } = request.query as { module?: string; roleName?: string };
          const rows = await prisma.fieldPermission.findMany({
            where: {
              tenantId: jwt.tenantId,
              deletedAt: null,
              ...(module ? { module } : {}),
              ...(roleName ? { roleName } : {}),
            },
            orderBy: [{ module: 'asc' }, { field: 'asc' }, { roleName: 'asc' }],
          });
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/field-permissions',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const parsed = CreateFieldPermissionBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const jwt = request.user as JwtPayload;
          const body = parsed.data;

          // Upsert on the natural key so re-configuring a grant is idempotent and
          // never trips the unique constraint. A soft-deleted row is revived.
          const existing = await prisma.fieldPermission.findFirst({
            where: { tenantId: jwt.tenantId, module: body.module, field: body.field, roleName: body.roleName },
          });
          const data = {
            canRead: body.canRead ?? true,
            canEdit: body.canEdit ?? true,
          };
          const row = existing
            ? await prisma.fieldPermission.update({
                where: { id: existing.id },
                data: { ...data, deletedAt: null },
              })
            : await prisma.fieldPermission.create({
                data: {
                  tenantId: jwt.tenantId,
                  module: body.module,
                  field: body.field,
                  roleName: body.roleName,
                  ...data,
                },
              });
          return reply.code(existing ? 200 : 201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/field-permissions/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = UpdateFieldPermissionBody.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const existing = await prisma.fieldPermission.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!existing) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          const updated = await prisma.fieldPermission.update({ where: { id }, data: parsed.data });
          return reply.send({ success: true, data: updated });
        }
      );

      r.delete(
        '/field-permissions/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const existing = await prisma.fieldPermission.findFirst({
            where: { id, tenantId: jwt.tenantId, deletedAt: null },
          });
          if (!existing) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Not found', requestId: request.id } });
          await prisma.fieldPermission.update({ where: { id }, data: { deletedAt: new Date() } });
          return reply.send({ success: true });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
