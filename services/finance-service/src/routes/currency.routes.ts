import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { FinancePrisma } from '../prisma.js';

const CurrencySchema = z.object({
  code: z.string().min(3).max(3).toUpperCase(),
  name: z.string().min(1),
  symbol: z.string().min(1),
  isBase: z.boolean().optional(),
  isActive: z.boolean().optional(),
  decimalPlaces: z.number().int().min(0).max(6).optional(),
});

const ExchangeRateSchema = z.object({
  fromCurrency: z.string().min(3).max(3).toUpperCase(),
  toCurrency: z.string().min(3).max(3).toUpperCase(),
  rate: z.coerce.number().positive(),
  source: z.string().optional(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
});

export async function registerCurrencyRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/currencies', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rows = await prisma.currency.findMany({
          where: { tenantId: jwt.tenantId },
          orderBy: [{ isBase: 'desc' }, { code: 'asc' }],
        });
        return reply.send({ success: true, data: rows });
      });

      r.post('/currencies', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const parsed = CurrencySchema.parse(request.body);
        if (parsed.isBase) {
          await prisma.currency.updateMany({
            where: { tenantId: jwt.tenantId, isBase: true },
            data: { isBase: false },
          });
        }
        const row = await prisma.currency.create({
          data: { tenantId: jwt.tenantId, ...parsed },
        });
        return reply.code(201).send({ success: true, data: row });
      });

      r.patch('/currencies/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const parsed = CurrencySchema.partial().parse(request.body);
        if (parsed.isBase) {
          await prisma.currency.updateMany({
            where: { tenantId: jwt.tenantId, isBase: true },
            data: { isBase: false },
          });
        }
        const row = await prisma.currency.update({
          where: { id },
          data: parsed,
        });
        return reply.send({ success: true, data: row });
      });

      r.delete('/currencies/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        await prisma.currency.delete({ where: { id } });
        return reply.send({ success: true, data: { id, deleted: true } });
      });

      r.get('/exchange-rates', { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rows = await prisma.exchangeRate.findMany({
          where: { tenantId: jwt.tenantId },
          orderBy: { effectiveFrom: 'desc' },
        });
        return reply.send({ success: true, data: rows });
      });

      r.post('/exchange-rates', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const parsed = ExchangeRateSchema.parse(request.body);
        const row = await prisma.exchangeRate.create({
          data: {
            tenantId: jwt.tenantId,
            fromCurrency: parsed.fromCurrency,
            toCurrency: parsed.toCurrency,
            rate: parsed.rate,
            source: parsed.source ?? 'manual',
            effectiveFrom: parsed.effectiveFrom ?? new Date(),
            effectiveTo: parsed.effectiveTo,
          },
        });
        return reply.code(201).send({ success: true, data: row });
      });

      r.patch('/exchange-rates/:id', { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) }, async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const parsed = ExchangeRateSchema.partial().parse(request.body);
        const row = await prisma.exchangeRate.update({
          where: { id },
          data: parsed,
        });
        return reply.send({ success: true, data: row });
      });
    },
    { prefix: '/api/v1' }
  );
}

