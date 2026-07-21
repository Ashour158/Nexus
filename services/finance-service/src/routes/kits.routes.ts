import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { TOPICS } from '@nexus/kafka';
import { NotFoundError, PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { FinancePrisma } from '../prisma.js';

const KitItemSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().int().positive().optional(),
  unitPrice: z.number().nonnegative().optional().nullable(),
  isOptional: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const KitSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  description: z.string().optional(),
  currency: z.string().optional(),
  listPrice: z.coerce.number().nonnegative(),
  isActive: z.boolean().optional(),
  allowItemOverride: z.boolean().optional(),
  items: z.array(KitItemSchema).default([]),
});

const UpdateKitSchema = z
  .object({
    name: z.string().min(1).optional(),
    sku: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    currency: z.string().optional(),
    listPrice: z.coerce.number().nonnegative().optional(),
    isActive: z.boolean().optional(),
    allowItemOverride: z.boolean().optional(),
    // When provided, the item set is REPLACED wholesale (delete + re-create).
    items: z.array(KitItemSchema).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const IdParam = z.object({ id: z.string().min(1) });

/**
 * Records a kit lifecycle event on the transactional outbox so downstream
 * consumers (CPQ cache invalidation, audit) observe kit mutations without
 * threading a Kafka producer through the catalog routes.
 */
async function emitKitEvent(
  prisma: FinancePrisma,
  tenantId: string,
  type: string,
  kitId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await prisma.outboxMessage.create({
    data: {
      topic: TOPICS.QUOTES,
      key: kitId,
      payload: { type, tenantId, occurredAt: new Date().toISOString(), ...payload } as never,
      tenantId,
      aggregateType: 'product_kit',
      aggregateId: kitId,
      eventType: type,
      status: 'PENDING',
      retryCount: 0,
    },
  }).catch((err: unknown) => console.error('[kits.routes] outbox write failed', err));
}

export async function registerKitsRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/product-kits', { preHandler: requirePermission(PERMISSIONS.PRODUCTS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rows = await prisma.productKit.findMany({
          where: { tenantId: jwt.tenantId, deletedAt: null },
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
        await emitKitEvent(prisma, jwt.tenantId, 'kit.created', row.id, { name: row.name });
        return reply.code(201).send({ success: true, data: row });
      });

      r.patch('/product-kits/:id', { preHandler: requirePermission(PERMISSIONS.PRODUCTS.UPDATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { id } = IdParam.parse(request.params);
        const parsed = UpdateKitSchema.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const existing = await prisma.productKit.findFirst({ where: { id, tenantId: jwt.tenantId, deletedAt: null } });
        if (!existing) throw new NotFoundError('ProductKit', id);
        const data = parsed.data;

        const row = await prisma.$transaction(async (tx) => {
          if (data.items !== undefined) {
            await tx.productKitItem.deleteMany({ where: { tenantId: jwt.tenantId, kitId: id } });
            await tx.productKitItem.createMany({
              data: data.items.map((item) => ({
                tenantId: jwt.tenantId,
                kitId: id,
                productId: item.productId,
                quantity: item.quantity ?? 1,
                unitPrice: item.unitPrice ?? null,
                isOptional: item.isOptional ?? false,
                sortOrder: item.sortOrder ?? 0,
              })),
            });
          }
          return tx.productKit.update({
            where: { id },
            data: {
              name: data.name,
              sku: data.sku ?? undefined,
              description: data.description ?? undefined,
              currency: data.currency,
              listPrice: data.listPrice,
              isActive: data.isActive,
              allowItemOverride: data.allowItemOverride,
            },
            include: { items: true },
          });
        });
        await emitKitEvent(prisma, jwt.tenantId, 'kit.updated', row.id, { name: row.name });
        return reply.send({ success: true, data: row });
      });

      r.delete('/product-kits/:id', { preHandler: requirePermission(PERMISSIONS.PRODUCTS.DELETE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const { id } = IdParam.parse(request.params);
        const existing = await prisma.productKit.findFirst({ where: { id, tenantId: jwt.tenantId, deletedAt: null } });
        if (!existing) throw new NotFoundError('ProductKit', id);
        // Soft-delete: quotes configured from this kit keep a resolvable
        // reference; items stay attached to the hidden kit.
        await prisma.productKit.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
        await emitKitEvent(prisma, jwt.tenantId, 'kit.deleted', id, { name: existing.name });
        return reply.send({ success: true, data: { id, deleted: true } });
      });
    },
    { prefix: '/api/v1' }
  );
}
