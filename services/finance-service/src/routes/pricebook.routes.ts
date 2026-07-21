import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { TOPICS } from '@nexus/kafka';
import { NotFoundError, PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { FinancePrisma } from '../prisma.js';

const PriceBookEntrySchema = z.object({
  productId: z.string().cuid(),
  unitPrice: z.coerce.number().nonnegative(),
  minQty: z.number().int().positive().optional(),
  discountPct: z.number().min(0).max(100).optional(),
});

const PriceBookSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  currency: z.string().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
  tiers: z.array(z.string()).optional(),
  entries: z.array(PriceBookEntrySchema).default([]),
});

const UpdatePriceBookSchema = z
  .object({
    name: z.string().min(1).optional(),
    code: z.string().nullable().optional(),
    currency: z.string().optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    validFrom: z.coerce.date().nullable().optional(),
    validTo: z.coerce.date().nullable().optional(),
    tiers: z.array(z.string()).optional(),
    // When provided, the entry set is REPLACED wholesale (delete + re-create).
    entries: z.array(PriceBookEntrySchema).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const IdParam = z.object({ id: z.string().min(1) });

/**
 * Records a catalog lifecycle event on the transactional outbox so downstream
 * consumers (CPQ cache invalidation, audit) observe price-book mutations. Using
 * the outbox keeps the write durable without threading a Kafka producer through
 * the catalog routes.
 */
async function emitPriceBookEvent(
  prisma: FinancePrisma,
  tenantId: string,
  type: string,
  priceBookId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await prisma.outboxMessage.create({
    data: {
      topic: TOPICS.QUOTES,
      key: priceBookId,
      payload: { type, tenantId, occurredAt: new Date().toISOString(), ...payload } as never,
      tenantId,
      aggregateType: 'price_book',
      aggregateId: priceBookId,
      eventType: type,
      status: 'PENDING',
      retryCount: 0,
    },
  }).catch((err: unknown) => console.error('[pricebook.routes] outbox write failed', err));
}

export async function registerPriceBookRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/price-books', { preHandler: requirePermission(PERMISSIONS.PRODUCTS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rows = await prisma.priceBook.findMany({
          where: { tenantId: jwt.tenantId, deletedAt: null },
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
            where: { tenantId: jwt.tenantId, isDefault: true, deletedAt: null },
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
        await emitPriceBookEvent(prisma, jwt.tenantId, 'pricebook.created', row.id, { name: row.name });
        return reply.code(201).send({ success: true, data: row });
      });

      r.patch('/price-books/:id', { preHandler: requirePermission(PERMISSIONS.PRODUCTS.UPDATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { id } = IdParam.parse(request.params);
        const parsed = UpdatePriceBookSchema.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const existing = await prisma.priceBook.findFirst({ where: { id, tenantId: jwt.tenantId, deletedAt: null } });
        if (!existing) throw new NotFoundError('PriceBook', id);
        const data = parsed.data;

        // Enforce the single-default invariant when promoting this book.
        if (data.isDefault === true) {
          await prisma.priceBook.updateMany({
            where: { tenantId: jwt.tenantId, isDefault: true, id: { not: id } },
            data: { isDefault: false },
          });
        }

        const row = await prisma.$transaction(async (tx) => {
          if (data.entries !== undefined) {
            await tx.priceBookEntry.deleteMany({ where: { tenantId: jwt.tenantId, priceBookId: id } });
            await tx.priceBookEntry.createMany({
              data: data.entries.map((entry) => ({
                tenantId: jwt.tenantId,
                priceBookId: id,
                productId: entry.productId,
                unitPrice: entry.unitPrice,
                minQty: entry.minQty ?? 1,
                discountPct: entry.discountPct ?? 0,
              })),
            });
          }
          return tx.priceBook.update({
            where: { id },
            data: {
              name: data.name,
              code: data.code ?? undefined,
              currency: data.currency,
              isDefault: data.isDefault,
              isActive: data.isActive,
              validFrom: data.validFrom,
              validTo: data.validTo,
              tiers: data.tiers,
            },
            include: { entries: true },
          });
        });
        await emitPriceBookEvent(prisma, jwt.tenantId, 'pricebook.updated', row.id, { name: row.name });
        return reply.send({ success: true, data: row });
      });

      r.delete('/price-books/:id', { preHandler: requirePermission(PERMISSIONS.PRODUCTS.DELETE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { id } = IdParam.parse(request.params);
        const existing = await prisma.priceBook.findFirst({ where: { id, tenantId: jwt.tenantId, deletedAt: null } });
        if (!existing) throw new NotFoundError('PriceBook', id);
        // Soft-delete: quotes priced from this book keep a resolvable
        // reference; entries stay with the hidden book instead of cascading.
        await prisma.priceBook.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, isDefault: false } });
        await emitPriceBookEvent(prisma, jwt.tenantId, 'pricebook.deleted', id, { name: existing.name });
        return reply.send({ success: true, data: { id, deleted: true } });
      });
    },
    { prefix: '/api/v1' }
  );
}
