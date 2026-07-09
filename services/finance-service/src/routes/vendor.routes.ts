import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { FinancePrisma } from '../prisma.js';

const VendorSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  address: z.record(z.unknown()).optional(),
  taxRegistration: z.string().optional(),
  paymentTerms: z.string().optional(),
  currency: z.string().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
  customFields: z.record(z.unknown()).optional(),
});

const VendorProductSchema = z.object({
  vendorId: z.string().cuid(),
  productId: z.string().cuid(),
  vendorSku: z.string().optional(),
  costPrice: z.coerce.number().nonnegative(),
  currency: z.string().optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
  minOrderQty: z.number().int().positive().optional(),
  isPreferred: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function registerVendorRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/vendors', { preHandler: requirePermission(PERMISSIONS.PRODUCTS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rows = await prisma.vendor.findMany({
          where: { tenantId: jwt.tenantId },
          include: { products: true },
          orderBy: { createdAt: 'desc' },
        });
        return reply.send({ success: true, data: rows });
      });

      r.post('/vendors', { preHandler: requirePermission(PERMISSIONS.PRODUCTS.CREATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const parsed = VendorSchema.parse(request.body);
        const row = await prisma.vendor.create({
          data: {
            tenantId: jwt.tenantId,
            name: parsed.name,
            code: parsed.code,
            email: parsed.email,
            phone: parsed.phone,
            website: parsed.website,
            address: parsed.address ?? {},
            taxRegistration: parsed.taxRegistration,
            paymentTerms: parsed.paymentTerms,
            currency: parsed.currency ?? 'USD',
            isActive: parsed.isActive ?? true,
            notes: parsed.notes,
            customFields: parsed.customFields ?? {},
          },
        });
        return reply.code(201).send({ success: true, data: row });
      });

      r.post('/vendors/products', { preHandler: requirePermission(PERMISSIONS.PRODUCTS.CREATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const parsed = VendorProductSchema.parse(request.body);
        const row = await prisma.vendorProduct.create({
          data: {
            tenantId: jwt.tenantId,
            vendorId: parsed.vendorId,
            productId: parsed.productId,
            vendorSku: parsed.vendorSku,
            costPrice: parsed.costPrice,
            currency: parsed.currency ?? 'USD',
            leadTimeDays: parsed.leadTimeDays ?? 0,
            minOrderQty: parsed.minOrderQty ?? 1,
            isPreferred: parsed.isPreferred ?? false,
            isActive: parsed.isActive ?? true,
          },
        });
        return reply.code(201).send({ success: true, data: row });
      });
    },
    { prefix: '/api/v1' }
  );
}

