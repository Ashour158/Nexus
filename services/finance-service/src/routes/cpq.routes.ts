import type { FastifyInstance } from 'fastify';
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
