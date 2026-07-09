import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import { TimelineQuerySchema } from '@nexus/validation';
import type { CrmPrisma } from '../prisma.js';

/**
 * Maps a timeline `entityType` to the corresponding Prisma `where` fragment.
 * Native CRM parents resolve to their typed FK column; money objects
 * (QUOTE|INVOICE|ORDER|CONTRACT|CAMPAIGN) resolve to the polymorphic pair.
 */
function entityWhere(
  entityType: string,
  entityId: string
): Record<string, string> {
  switch (entityType) {
    case 'DEAL':
      return { dealId: entityId };
    case 'CONTACT':
      return { contactId: entityId };
    case 'LEAD':
      return { leadId: entityId };
    case 'ACCOUNT':
      return { accountId: entityId };
    default:
      // QUOTE | INVOICE | ORDER | CONTRACT | CAMPAIGN
      return { entityType, entityId };
  }
}

interface TimelineItem {
  kind: 'activity' | 'note';
  id: string;
  createdAt: Date;
  data: unknown;
}

/**
 * Registers `GET /api/v1/timeline` — a unified, tenant-scoped, permission-gated
 * feed merging Activities + Notes for ANY entity (native CRM or money object).
 * Finance-service surfaces `/quotes/:id/timeline` by forwarding the user JWT to
 * `GET /api/v1/timeline?entityType=QUOTE&entityId=<id>`.
 */
export async function registerTimelineRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get(
        '/timeline',
        { preHandler: requirePermission(PERMISSIONS.ACTIVITIES.READ) },
        async (request, reply) => {
          const parsed = TimelineQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const { entityType, entityId, page, limit } = parsed.data;
          const scope = entityWhere(entityType, entityId);
          const activityWhere = { tenantId: jwt.tenantId, ...scope };
          const noteWhere = { tenantId: jwt.tenantId, ...scope };

          // Over-fetch page*limit from each side so the merged window is exact.
          const window = page * limit;
          const [activities, notes, activityTotal, noteTotal] =
            await Promise.all([
              prisma.activity.findMany({
                where: activityWhere,
                orderBy: { createdAt: 'desc' },
                take: window,
              }),
              prisma.note.findMany({
                where: noteWhere,
                orderBy: { createdAt: 'desc' },
                take: window,
              }),
              prisma.activity.count({ where: activityWhere }),
              prisma.note.count({ where: noteWhere }),
            ]);

          const merged: TimelineItem[] = [
            ...activities.map((a) => ({
              kind: 'activity' as const,
              id: a.id,
              createdAt: a.createdAt,
              data: a,
            })),
            ...notes.map((n) => ({
              kind: 'note' as const,
              id: n.id,
              createdAt: n.createdAt,
              data: n,
            })),
          ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

          const start = (page - 1) * limit;
          const items = merged.slice(start, start + limit);
          const total = activityTotal + noteTotal;

          return reply.send({
            success: true,
            data: {
              items,
              total,
              page,
              limit,
              totalPages: Math.ceil(total / limit) || 1,
            },
          });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
