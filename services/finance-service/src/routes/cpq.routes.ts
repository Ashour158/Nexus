import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload, CpqPricingRequest } from '@nexus/shared-types';
import {
  PERMISSIONS,
  requirePermission,
  ValidationError,
} from '@nexus/service-utils';
import { CpqPriceRequestSchema } from '@nexus/validation';
import type { FinancePrisma } from '../prisma.js';
import { CpqPricingEngine } from '../cpq/pricing-engine.js';

/**
 * Exposes the CPQ pricing engine (Section 40) as `POST /api/v1/cpq/price`.
 * Quote creation / approval flows live under `/quotes/*` (Phase 2.2); this
 * route is the real-time pricing calculator called by the web UI.
 */
export async function registerCpqRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  const engine = new CpqPricingEngine(prisma);

  await app.register(
    async (r) => {
      r.get(
        '/cpq/validate-promo',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.CREATE) },
        async (request, reply) => {
          const raw = request.query as { code?: string };
          const parsed = z
            .object({ code: z.string().min(1).max(50) })
            .safeParse({ code: raw.code });
          if (!parsed.success) {
            throw new ValidationError('Invalid query', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const code = parsed.data.code.trim().toUpperCase();
          const row = await prisma.promoCode.findFirst({
            where: { tenantId: jwt.tenantId, code, isActive: true },
          });
          const now = new Date();
          if (
            !row ||
            (row.validFrom && row.validFrom > now) ||
            (row.validUntil && row.validUntil < now) ||
            (row.maxUses !== null && row.uses >= row.maxUses)
          ) {
            return reply.send({
              success: true,
              data: { valid: false as const },
            });
          }
          return reply.send({
            success: true,
            data: {
              valid: true as const,
              name: row.description ?? row.code,
              discountPercent: row.discountPercent,
            },
          });
        }
      );

      r.post(
        '/cpq/price',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.CREATE) },
        async (request, reply) => {
          const parsed = CpqPriceRequestSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const input: CpqPricingRequest = {
            tenantId: jwt.tenantId,
            dealId: parsed.data.dealId,
            accountId: parsed.data.accountId,
            currency: parsed.data.currency,
            paymentTerms: parsed.data.paymentTerms,
            appliedPromos: parsed.data.appliedPromos,
            items: parsed.data.items,
          };
          const result = await engine.calculate(input);
          return reply.send({ success: true, data: result });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
