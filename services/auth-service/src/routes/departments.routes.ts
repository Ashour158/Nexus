import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { AuthPrisma } from '../prisma.js';

interface DeptRow {
  id: string;
  tenantId: string;
  name: string;
  code: string | null;
  description: string | null;
  parentDepartmentId: string | null;
  headUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type DeptNode = DeptRow & { children: DeptNode[] };

/** Build a nested tree from a flat list keyed by parentDepartmentId. */
function buildTree(rows: DeptRow[]): DeptNode[] {
  const byId = new Map<string, DeptNode>();
  for (const row of rows) byId.set(row.id, { ...row, children: [] });
  const roots: DeptNode[] = [];
  for (const node of byId.values()) {
    if (node.parentDepartmentId && byId.has(node.parentDepartmentId)) {
      byId.get(node.parentDepartmentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/**
 * Departments routes (CRM system-control layer). Hierarchical, tenant-scoped.
 * Reads guarded by SETTINGS.READ, mutations by SETTINGS.UPDATE. Tenant is
 * injected automatically by the tenant Prisma extension.
 */
export async function registerDepartmentsRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma
): Promise<void> {
  const IdParam = z.object({ id: z.string().min(1) });

  const CreateSchema = z
    .object({
      name: z.string().min(1).max(200),
      code: z.string().max(60).nullish(),
      description: z.string().max(2000).nullish(),
      parentDepartmentId: z.string().min(1).nullish(),
      headUserId: z.string().min(1).nullish(),
    })
    .strict();

  const UpdateSchema = CreateSchema.partial();

  // Walk parent links up from `startParentId`; returns true if `targetId` is
  // reachable (i.e. setting target's parent to startParentId would form a cycle).
  async function wouldCycle(
    tenantId: string,
    targetId: string,
    startParentId: string
  ): Promise<boolean> {
    let cursor: string | null = startParentId;
    const seen = new Set<string>();
    let guard = 0;
    while (cursor && guard < 1000) {
      if (cursor === targetId) return true;
      if (seen.has(cursor)) return true; // pre-existing cycle — fail closed
      seen.add(cursor);
      const parent: { parentDepartmentId: string | null } | null = await (
        prisma as any
      ).department.findFirst({
        where: { id: cursor, tenantId },
        select: { parentDepartmentId: true },
      });
      cursor = parent?.parentDepartmentId ?? null;
      guard += 1;
    }
    return false;
  }

  await app.register(
    async (r) => {
      // GET /api/v1/departments?tree=true
      r.get(
        '/departments',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (req, reply) => {
          const jwt = req.user as JwtPayload;
          const q = req.query as Record<string, string>;
          const rows: DeptRow[] = await (prisma as any).department.findMany({
            where: { tenantId: jwt.tenantId },
            orderBy: [{ name: 'asc' }],
          });
          if (q.tree === 'true') {
            return reply.send({ success: true, data: buildTree(rows) });
          }
          return reply.send({ success: true, data: rows });
        }
      );

      // POST /api/v1/departments
      r.post(
        '/departments',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (req, reply) => {
          const jwt = req.user as JwtPayload;
          const body = CreateSchema.parse(req.body);

          if (body.parentDepartmentId) {
            const parent = await (prisma as any).department.findFirst({
              where: { id: body.parentDepartmentId, tenantId: jwt.tenantId },
              select: { id: true },
            });
            if (!parent) {
              return reply.code(400).send({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'parentDepartmentId not found in tenant', requestId: req.id },
              });
            }
          }

          const dept = await (prisma as any).department.create({ data: body });
          await (prisma as any).auditLog.create({
            data: {
              tenantId: jwt.tenantId,
              userId: jwt.sub,
              action: 'CREATE',
              resource: 'Department',
              resourceId: dept.id,
              newValue: body as object,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
            },
          });
          return reply.code(201).send({ success: true, data: dept });
        }
      );

      // PATCH /api/v1/departments/:id
      r.patch(
        '/departments/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (req, reply) => {
          const jwt = req.user as JwtPayload;
          const { id } = IdParam.parse(req.params);
          const body = UpdateSchema.parse(req.body);

          const existing = await (prisma as any).department.findFirst({
            where: { id, tenantId: jwt.tenantId },
            select: { id: true },
          });
          if (!existing) {
            return reply.code(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Department not found', requestId: req.id },
            });
          }

          if (body.parentDepartmentId !== undefined && body.parentDepartmentId !== null) {
            if (body.parentDepartmentId === id) {
              return reply.code(400).send({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'A department cannot be its own parent', requestId: req.id },
              });
            }
            const parent = await (prisma as any).department.findFirst({
              where: { id: body.parentDepartmentId, tenantId: jwt.tenantId },
              select: { id: true },
            });
            if (!parent) {
              return reply.code(400).send({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'parentDepartmentId not found in tenant', requestId: req.id },
              });
            }
            if (await wouldCycle(jwt.tenantId, id, body.parentDepartmentId)) {
              return reply.code(400).send({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Reparenting would create a cycle', requestId: req.id },
              });
            }
          }

          const dept = await (prisma as any).department.update({
            where: { id_tenantId: { id, tenantId: jwt.tenantId } },
            data: body,
          });
          await (prisma as any).auditLog.create({
            data: {
              tenantId: jwt.tenantId,
              userId: jwt.sub,
              action: 'UPDATE',
              resource: 'Department',
              resourceId: id,
              newValue: body as object,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
            },
          });
          return reply.send({ success: true, data: dept });
        }
      );

      // DELETE /api/v1/departments/:id — blocked when it has children or members.
      r.delete(
        '/departments/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (req, reply) => {
          const jwt = req.user as JwtPayload;
          const { id } = IdParam.parse(req.params);

          const existing = await (prisma as any).department.findFirst({
            where: { id, tenantId: jwt.tenantId },
            select: { id: true },
          });
          if (!existing) {
            return reply.code(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'Department not found', requestId: req.id },
            });
          }

          const [childCount, memberCount] = await Promise.all([
            (prisma as any).department.count({ where: { parentDepartmentId: id, tenantId: jwt.tenantId } }),
            (prisma as any).userProfile.count({ where: { departmentId: id, tenantId: jwt.tenantId } }),
          ]);
          if (childCount > 0 || memberCount > 0) {
            return reply.code(409).send({
              success: false,
              error: {
                code: 'CONFLICT',
                message: `Cannot delete: department has ${childCount} sub-department(s) and ${memberCount} member(s). Reparent or reassign them first.`,
                requestId: req.id,
              },
            });
          }

          await (prisma as any).department.delete({
            where: { id_tenantId: { id, tenantId: jwt.tenantId } },
          });
          await (prisma as any).auditLog.create({
            data: {
              tenantId: jwt.tenantId,
              userId: jwt.sub,
              action: 'DELETE',
              resource: 'Department',
              resourceId: id,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
            },
          });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
