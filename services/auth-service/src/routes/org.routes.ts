import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { AuthPrisma } from '../prisma.js';

const MAX_ORG_CHART_NODES = 5000;
const MAX_ORG_CHART_DEPTH = 30;

interface OrgProfileRow {
  userId: string;
  managerId: string | null;
  jobTitle: string | null;
  department: string | null;
  departmentId: string | null;
  levelId: string | null;
}

/**
 * Org assignment + org-chart routes (CRM system-control layer).
 *
 * - PATCH /api/v1/users/:id/org  → set managerId / departmentId / levelId /
 *   jobTitle on a user's profile, with cycle-safe manager validation.
 * - GET  /api/v1/org-chart       → reporting tree built from UserProfile.managerId.
 *
 * All queries are tenant-scoped (explicit where + tenant Prisma extension).
 */
export async function registerOrgRoutes(
  app: FastifyInstance,
  prisma: AuthPrisma
): Promise<void> {
  const IdParam = z.object({ id: z.string().min(1) });

  const OrgUpdateSchema = z
    .object({
      // `null` clears the assignment; omitting a key leaves it unchanged.
      managerId: z.string().min(1).nullish(),
      departmentId: z.string().min(1).nullish(),
      levelId: z.string().min(1).nullish(),
      jobTitle: z.string().max(200).nullish(),
    })
    .strict();

  // Returns true if making `managerId` the manager of `userId` would create a
  // reporting cycle (walking managerId up from managerId reaches userId).
  async function managerWouldCycle(
    tenantId: string,
    userId: string,
    managerId: string
  ): Promise<boolean> {
    let cursor: string | null = managerId;
    const seen = new Set<string>();
    let guard = 0;
    while (cursor && guard < 10000) {
      if (cursor === userId) return true;
      if (seen.has(cursor)) return true; // pre-existing cycle — fail closed
      seen.add(cursor);
      const profile: { managerId: string | null } | null = await (
        prisma as any
      ).userProfile.findFirst({
        where: { userId: cursor, tenantId },
        select: { managerId: true },
      });
      cursor = profile?.managerId ?? null;
      guard += 1;
    }
    return false;
  }

  await app.register(
    async (r) => {
      // PATCH /api/v1/users/:id/org
      r.patch(
        '/users/:id/org',
        { preHandler: requirePermission(PERMISSIONS.USERS.UPDATE) },
        async (req, reply) => {
          const jwt = req.user as JwtPayload;
          const { id } = IdParam.parse(req.params);
          const body = OrgUpdateSchema.parse(req.body);

          // Target user must exist in this tenant.
          const target = await (prisma as any).user.findFirst({
            where: { id, tenantId: jwt.tenantId },
            select: { id: true },
          });
          if (!target) {
            return reply.code(404).send({
              success: false,
              error: { code: 'NOT_FOUND', message: 'User not found', requestId: req.id },
            });
          }

          // Validate manager: exists in tenant, not self, no cycle.
          if (body.managerId !== undefined && body.managerId !== null) {
            if (body.managerId === id) {
              return reply.code(400).send({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'A user cannot be their own manager', requestId: req.id },
              });
            }
            const manager = await (prisma as any).user.findFirst({
              where: { id: body.managerId, tenantId: jwt.tenantId },
              select: { id: true },
            });
            if (!manager) {
              return reply.code(400).send({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'managerId not found in tenant', requestId: req.id },
              });
            }
            if (await managerWouldCycle(jwt.tenantId, id, body.managerId)) {
              return reply.code(400).send({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Assigning this manager would create a reporting cycle', requestId: req.id },
              });
            }
          }

          // Validate department + level belong to the tenant.
          if (body.departmentId !== undefined && body.departmentId !== null) {
            const dept = await (prisma as any).department.findFirst({
              where: { id: body.departmentId, tenantId: jwt.tenantId },
              select: { id: true },
            });
            if (!dept) {
              return reply.code(400).send({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'departmentId not found in tenant', requestId: req.id },
              });
            }
          }
          if (body.levelId !== undefined && body.levelId !== null) {
            const level = await (prisma as any).level.findFirst({
              where: { id: body.levelId, tenantId: jwt.tenantId },
              select: { id: true },
            });
            if (!level) {
              return reply.code(400).send({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'levelId not found in tenant', requestId: req.id },
              });
            }
          }

          // Only the fields explicitly present are written (upsert-safe).
          const profileData: Record<string, unknown> = {};
          for (const key of ['managerId', 'departmentId', 'levelId', 'jobTitle'] as const) {
            if (body[key] !== undefined) profileData[key] = body[key];
          }

          const user = await (prisma as any).user.update({
            where: { id_tenantId: { id, tenantId: jwt.tenantId } },
            data: {
              profile: {
                upsert: {
                  create: { tenantId: jwt.tenantId, ...profileData },
                  update: profileData,
                },
              },
            },
            include: { profile: true },
          });

          await (prisma as any).auditLog.create({
            data: {
              tenantId: jwt.tenantId,
              userId: jwt.sub,
              action: 'UPDATE',
              resource: 'UserOrg',
              resourceId: id,
              newValue: profileData as object,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
            },
          });

          // SECURITY: strip the credential hash before returning the user row.
          const { passwordHash: _pw, mfaSecret: _mfa, ...safeUser } = user as Record<string, unknown>;
          return reply.send({ success: true, data: safeUser });
        }
      );

      // GET /api/v1/org-chart — reporting tree for the tenant.
      r.get(
        '/org-chart',
        { preHandler: requirePermission(PERMISSIONS.USERS.READ) },
        async (req, reply) => {
          const jwt = req.user as JwtPayload;

          const users: Array<{
            id: string;
            firstName: string;
            lastName: string;
            avatarUrl: string | null;
            isActive: boolean;
            profile: OrgProfileRow | null;
          }> = await (prisma as any).user.findMany({
            where: { tenantId: jwt.tenantId, isActive: true },
            take: MAX_ORG_CHART_NODES,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              isActive: true,
              profile: {
                select: {
                  userId: true,
                  managerId: true,
                  jobTitle: true,
                  department: true,
                  departmentId: true,
                  levelId: true,
                },
              },
            },
          });

          interface OrgNode {
            userId: string;
            name: string;
            jobTitle: string | null;
            department: string | null;
            departmentId: string | null;
            levelId: string | null;
            avatarUrl: string | null;
            directReports: OrgNode[];
          }

          const nodeById = new Map<string, OrgNode>();
          const managerOf = new Map<string, string | null>();
          for (const u of users) {
            nodeById.set(u.id, {
              userId: u.id,
              name: `${u.firstName} ${u.lastName}`.trim(),
              jobTitle: u.profile?.jobTitle ?? null,
              department: u.profile?.department ?? null,
              departmentId: u.profile?.departmentId ?? null,
              levelId: u.profile?.levelId ?? null,
              avatarUrl: u.avatarUrl ?? null,
              directReports: [],
            });
            managerOf.set(u.id, u.profile?.managerId ?? null);
          }

          // Attach each node to its manager; roots = no (resolvable) manager.
          const roots: OrgNode[] = [];
          for (const [userId, node] of nodeById) {
            const managerId = managerOf.get(userId) ?? null;
            if (managerId && nodeById.has(managerId)) {
              nodeById.get(managerId)!.directReports.push(node);
            } else {
              roots.push(node);
            }
          }

          // Depth cap: truncate directReports beyond MAX_ORG_CHART_DEPTH.
          const capDepth = (nodes: OrgNode[], depth: number): void => {
            if (depth >= MAX_ORG_CHART_DEPTH) {
              for (const n of nodes) n.directReports = [];
              return;
            }
            for (const n of nodes) capDepth(n.directReports, depth + 1);
          };
          capDepth(roots, 0);

          const sortByName = (nodes: OrgNode[]): void => {
            nodes.sort((a, b) => a.name.localeCompare(b.name));
            for (const n of nodes) sortByName(n.directReports);
          };
          sortByName(roots);

          return reply.send({
            success: true,
            data: roots,
            meta: { totalNodes: users.length, truncated: users.length >= MAX_ORG_CHART_NODES },
          });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
