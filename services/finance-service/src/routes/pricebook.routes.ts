import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { FinancePrisma } from '../prisma.js';

const PriceBookSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  currency: z.string().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
  tiers: z.array(z.string()).optional(),
  entries: z
    .array(
      z.object({
        productId: z.string().cuid(),
        unitPrice: z.coerce.number().nonnegative(),
        minQty: z.number().int().positive().optional(),
        discountPct: z.number().min(0).max(100).optional(),
      })
    )
    .default([]),
});

export async function registerPriceBookRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/price-books', { preHandler: requirePermission(PERMISSIONS.PRODUCTS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rows = await prisma.priceBook.findMany({
          where: { tenantId: jwt.tenantId },
          include: { entries: true },
          orderBy: { createdAt: 'desc' },
        });
        return reply.send({ success: true, data: rows });
      });

      r.post('/price-books', { preHandler: requirePermission(PERMISSIONS.PRODUCTS.CREATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const parsed = PriceBookSchema.parse(request.body);
        if (parsed.isDefault) {
          await prisma.priceBook.updateMany({
            where: { tenantId: jwt.tenantId, isDefault: true },
            data: { isDefault: false },
          });
        }
        const row = await prisma.priceBook.create({
          data: {
            tenantId: jwt.tenantId,
            name: parsed.name,
            code: parsed.code,
            currency: parsed.currency ?? 'USD',
            isDefault: parsed.isDefault ?? false,
            isActive: parsed.isActive ?? true,
            validFrom: parsed.validFrom,
            validTo: parsed.validTo,
            tiers: parsed.tiers ?? [],
            entries: {
              create: parsed.entries.map((entry) => ({
                tenantId: jwt.tenantId,
                productId: entry.productId,
                unitPrice: entry.unitPrice,
                minQty: entry.minQty ?? 1,
                discountPct: entry.discountPct ?? 0,
              })),
            },
          },
          include: { entries: true },
        });
        return reply.code(201).send({ success: true, data: row });
      });
    },
    { prefix: '/api/v1' }
  );
}

