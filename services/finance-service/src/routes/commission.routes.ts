import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import {
  ForbiddenError,
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import {
  ClawbackCommissionSchema,
  CommissionListQuerySchema,
  CommissionSummaryQuerySchema,
  IdParamSchema,
} from '@nexus/validation';
import type { FinancePrisma } from '../prisma.js';
import { createCommissionService } from '../services/commission.service.js';

const DealParamsSchema = z.object({ dealId: z.string().cuid() });

function requireFinanceRole(jwt: JwtPayload) {
  const roles = jwt.roles ?? [];
  if (
    !roles.includes('FINANCE') &&
    !roles.includes('ADMIN') &&
    !roles.includes('SUPER_ADMIN') &&
    !(jwt.permissions ?? []).includes('*')
  ) {
    throw new ForbiddenError('Finance role required');
  }
}

/**
 * Registers the `/api/v1/commissions/*` route family (Section 41).
 * Approval and clawback mutations are restricted to the FINANCE role
 * (or ADMIN / wildcard holders) in addition to the permission check.
 */
export async function registerCommissionRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma,
  producer: NexusProducer
): Promise<void> {
  const commissions = createCommissionService(prisma, producer);

  await app.register(
    async (r) => {
      // ─── LIST ───────────────────────────────────────────────────────────
      r.get(
        '/commissions',
        { preHandler: requirePermission(PERMISSIONS.COMMISSION.READ) },
        async (request, reply) => {
          const parsed = CommissionListQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const q = parsed.data;
          const result = await commissions.listCommissions(
            jwt.tenantId,
            {
              ownerId: q.ownerId,
              userId: q.userId,
              status: q.status,
              dateFrom: q.dateFrom,
              dateTo: q.dateTo,
            },
            { page: q.page, limit: q.limit, sortDir: q.sortDir }
          );
          return reply.send({ success: true, data: result });
        }
      );

      // ─── SUMMARY ────────────────────────────────────────────────────────
      r.get(
        '/commissions/summary',
        { preHandler: requirePermission(PERMISSIONS.COMMISSION.READ) },
        async (request, reply) => {
          const parsed = CommissionSummaryQuerySchema.safeParse(request.query);
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const summary = await commissions.getCommissionSummary(
            jwt.tenantId,
            parsed.data.ownerId,
            { year: parsed.data.year, quarter: parsed.data.quarter }
          );
          return reply.send({ success: true, data: summary });
        }
      );

      // ─── APPROVE ────────────────────────────────────────────────────────
      r.post(
        '/commissions/:id/approve',
        { preHandler: requirePermission(PERMISSIONS.COMMISSION.APPROVE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          requireFinanceRole(jwt);
          const row = await commissions.approveCommission(
            jwt.tenantId,
            id,
            jwt.sub
          );
          return reply.send({ success: true, data: row });
        }
      );

      // ─── CLAWBACK ───────────────────────────────────────────────────────
      r.post(
        '/commissions/:id/clawback',
        { preHandler: requirePermission(PERMISSIONS.COMMISSION.MANAGE) },
        async (request, reply) => {
          const { id } = IdParamSchema.parse(request.params);
          const parsed = ClawbackCommissionSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          requireFinanceRole(jwt);
          const row = await commissions.clawbackCommission(
            jwt.tenantId,
            id,
            parsed.data.reason
          );
          return reply.send({ success: true, data: row });
        }
      );

      // ─── COMMISSION FOR DEAL ────────────────────────────────────────────
      r.get(
        '/deals/:dealId/commission',
        { preHandler: requirePermission(PERMISSIONS.COMMISSION.READ) },
        async (request, reply) => {
          const { dealId } = DealParamsSchema.parse(request.params);
          const jwt = request.user as JwtPayload;
          const record = await commissions.getCommissionForDeal(
            jwt.tenantId,
            dealId
          );
          return reply.send({ success: true, data: record });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
