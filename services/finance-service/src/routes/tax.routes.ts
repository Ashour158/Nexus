import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { FinancePrisma } from '../prisma.js';

const ZoneSchema = z.object({
  name: z.string().min(1),
  country: z.string().max(2).optional().nullable(),
  isActive: z.boolean().optional(),
});

const RateSchema = z.object({
  zoneId: z.string().cuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  rate: z.number().min(0),
  taxType: z.string().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function registerTaxRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/tax-zones', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rows = await prisma.taxZone.findMany({
          where: { tenantId: jwt.tenantId },
          include: { rates: true },
          orderBy: { createdAt: 'desc' },
        });
        return reply.send({ success: true, data: rows });
      });

      r.post('/tax-zones', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const parsed = ZoneSchema.parse(request.body);
        const row = await prisma.taxZone.create({
          data: { tenantId: jwt.tenantId, ...parsed },
        });
        return reply.code(201).send({ success: true, data: row });
      });

      r.get('/tax-rates', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rows = await prisma.taxRate.findMany({
          where: { tenantId: jwt.tenantId },
          include: { zone: true },
          orderBy: { createdAt: 'desc' },
        });
        return reply.send({ success: true, data: rows });
      });

      r.post('/tax-rates', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const parsed = RateSchema.parse(request.body);
        if (parsed.isDefault) {
          await prisma.taxRate.updateMany({
            where: { tenantId: jwt.tenantId, zoneId: parsed.zoneId, isDefault: true },
            data: { isDefault: false },
          });
        }
        const row = await prisma.taxRate.create({
          data: {
            tenantId: jwt.tenantId,
            zoneId: parsed.zoneId,
            name: parsed.name,
            code: parsed.code,
            rate: parsed.rate,
            taxType: parsed.taxType ?? 'VAT',
            isDefault: parsed.isDefault ?? false,
            isActive: parsed.isActive ?? true,
          },
        });
        return reply.code(201).send({ success: true, data: row });
      });

      r.patch('/tax-rates/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const parsed = RateSchema.partial().parse(request.body);
        const row = await prisma.taxRate.update({
          where: { id },
          data: parsed,
        });
        return reply.send({ success: true, data: row });
      });
    },
    { prefix: '/api/v1' }
  );
}

