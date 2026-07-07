import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { NexusProducer } from '@nexus/kafka';
import type { CrmPrisma } from '../prisma.js';
import { createDealProductsService } from '../services/deal-products.service.js';
import { createDealTeamService } from '../services/deal-team.service.js';

// ─── Local schemas ────────────────────────────────────────────────────────────

const IdParam = z.object({ id: z.string().cuid() });

const CreateProductSchema = z.object({
  productId: z.string().optional(),
  name: z.string().min(1).max(500),
  quantity: z.coerce.number().min(0).default(1),
  unitPrice: z.coerce.number().min(0),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
});

const UpdateProductSchema = z
  .object({
    productId: z.string().nullable().optional(),
    name: z.string().min(1).max(500).optional(),
    quantity: z.coerce.number().min(0).optional(),
    unitPrice: z.coerce.number().min(0).optional(),
    discountPercent: z.coerce.number().min(0).max(100).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

const CreateTeamSchema = z.object({
  userId: z.string().min(1),
  role: z.string().min(1).max(120),
  splitPercent: z.coerce.number().min(0).max(100).optional(),
  splitType: z.enum(['revenue', 'overlay']).optional(),
});

const UpdateTeamSchema = z
  .object({
    role: z.string().min(1).max(120).optional(),
    splitPercent: z.coerce.number().min(0).max(100).optional(),
    splitType: z.enum(['revenue', 'overlay']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

// ─── Registration ───────────────────────────────────────────────────────────

/**
 * Registers deal line-items (`DealProduct`) and deal splits/teams (`DealTeam`).
 *
 * Line-items roll up into `Deal.amount` (sum of `lineTotal`), matching how the
 * Big-4 CRMs derive deal value from product rows. Deal teams carry revenue /
 * overlay splits that feed the incentive-service commission engine.
 */
export async function registerDealLineItemsRoutes(
  app: FastifyInstance,
  prisma: CrmPrisma,
  producer: NexusProducer
): Promise<void> {
  const products = createDealProductsService(prisma, producer);
  const team = createDealTeamService(prisma, producer);

  await app.register(
    async (r) => {
      // ─── PRODUCTS / LINE-ITEMS ──────────────────────────────────────────
      r.get(
        '/deals/:id/products',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParam.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await products.listByDeal(jwt.tenantId, id);
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/deals/:id/products',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParam.parse(request.params);
          const parsed = CreateProductSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const data = await products.create(jwt.tenantId, id, parsed.data);
          return reply.code(201).send({ success: true, data });
        }
      );

      r.patch(
        '/deal-products/:id',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParam.parse(request.params);
          const parsed = UpdateProductSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const data = await products.update(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data });
        }
      );

      r.delete(
        '/deal-products/:id',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParam.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await products.remove(jwt.tenantId, id);
          return reply.send({ success: true, data });
        }
      );

      // ─── DEAL TEAM / SPLITS ─────────────────────────────────────────────
      r.get(
        '/deals/:id/team',
        { preHandler: requirePermission(PERMISSIONS.DEALS.READ) },
        async (request, reply) => {
          const { id } = IdParam.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await team.listByDeal(jwt.tenantId, id);
          return reply.send({ success: true, data });
        }
      );

      r.post(
        '/deals/:id/team',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParam.parse(request.params);
          const parsed = CreateTeamSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const data = await team.create(jwt.tenantId, id, parsed.data);
          return reply.code(201).send({ success: true, data });
        }
      );

      r.patch(
        '/deal-team/:id',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParam.parse(request.params);
          const parsed = UpdateTeamSchema.safeParse(request.body);
          if (!parsed.success) {
            throw new ValidationError('Invalid body', parsed.error.flatten());
          }
          const jwt = request.user as JwtPayload;
          const data = await team.update(jwt.tenantId, id, parsed.data);
          return reply.send({ success: true, data });
        }
      );

      r.delete(
        '/deal-team/:id',
        { preHandler: requirePermission(PERMISSIONS.DEALS.UPDATE) },
        async (request, reply) => {
          const { id } = IdParam.parse(request.params);
          const jwt = request.user as JwtPayload;
          const data = await team.remove(jwt.tenantId, id);
          return reply.send({ success: true, data });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
