import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { FinancePrisma } from '../prisma.js';

const KitSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  description: z.string().optional(),
  currency: z.string().optional(),
  listPrice: z.coerce.number().nonnegative(),
  isActive: z.boolean().optional(),
  allowItemOverride: z.boolean().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().cuid(),
        quantity: z.number().int().positive().optional(),
        unitPrice: z.number().nonnegative().optional().nullable(),
        isOptional: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .default([]),
});

export async function registerKitsRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/product-kits', { preHandler: requirePermission(PERMISSIONS.PRODUCTS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rows = await prisma.productKit.findMany({
          where: { tenantId: jwt.tenantId },
          include: { items: true },
          orderBy: { createdAt: 'desc' },
        });
        return reply.send({ success: true, data: rows });
      });

      r.post('/product-kits', { preHandler: requirePermission(PERMISSIONS.PRODUCTS.CREATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const parsed = KitSchema.parse(request.body);
        const row = await prisma.productKit.create({
          data: {
            tenantId: jwt.tenantId,
            name: parsed.name,
            sku: parsed.sku,
            description: parsed.description,
            currency: parsed.currency ?? 'USD',
            listPrice: parsed.listPrice,
            isActive: parsed.isActive ?? true,
            allowItemOverride: parsed.allowItemOverride ?? true,
            items: {
              create: parsed.items.map((item) => ({
                tenantId: jwt.tenantId,
                productId: item.productId,
                quantity: item.quantity ?? 1,
                unitPrice: item.unitPrice ?? null,
                isOptional: item.isOptional ?? false,
                sortOrder: item.sortOrder ?? 0,
              })),
            },
          },
          include: { items: true },
        });
        return reply.code(201).send({ success: true, data: row });
      });
    },
    { prefix: '/api/v1' }
  );
}

