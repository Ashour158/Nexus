import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { NotFoundError, PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { FinancePrisma } from '../prisma.js';
import { createConfiguratorService } from '../services/configurator.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const IdParam = z.object({ id: z.string().min(1) });

const ConfigurableProductSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});
const UpdateConfigurableProductSchema = ConfigurableProductSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'At least one field is required' }
);

const OptionGroupSchema = z.object({
  configurableProductId: z.string().min(1),
  name: z.string().min(1),
  minSelect: z.number().int().min(0).optional(),
  maxSelect: z.number().int().min(0).optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
const UpdateOptionGroupSchema = OptionGroupSchema.omit({ configurableProductId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const ProductOptionSchema = z.object({
  optionGroupId: z.string().min(1),
  name: z.string().min(1),
  sku: z.string().nullable().optional(),
  priceDelta: z.coerce.number().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
const UpdateProductOptionSchema = ProductOptionSchema.omit({ optionGroupId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const ConfigRuleSchema = z.object({
  configurableProductId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['REQUIRES', 'EXCLUDES', 'AUTO_ADD', 'PRICE_ADJUST']),
  whenOptionId: z.string().min(1),
  thenOptionId: z.string().nullable().optional(),
  adjustment: z.coerce.number().nullable().optional(),
  isActive: z.boolean().optional(),
});
const UpdateConfigRuleSchema = ConfigRuleSchema.omit({ configurableProductId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const ValidateSchema = z.object({
  configurableProductId: z.string().min(1),
  selectedOptionIds: z.array(z.string().min(1)).default([]),
});

const ApplyToQuoteSchema = z.object({
  quoteId: z.string().min(1),
  configurableProductId: z.string().min(1),
  selectedOptionIds: z.array(z.string().min(1)).default([]),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function registerConfiguratorRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  const configurator = createConfiguratorService(prisma);

  await app.register(
    async (r) => {
      // ── Configurable products ────────────────────────────────────────────
      r.get(
        '/configurator/products',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const rows = await prisma.configurableProduct.findMany({
            where: { tenantId: jwt.tenantId },
            include: { optionGroups: { include: { options: true }, orderBy: { sortOrder: 'asc' } }, rules: true },
            orderBy: { createdAt: 'desc' },
          });
          return reply.send({ success: true, data: rows });
        }
      );

      r.get(
        '/configurator/products/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const row = await prisma.configurableProduct.findFirst({
            where: { id, tenantId: jwt.tenantId },
            include: { optionGroups: { include: { options: true }, orderBy: { sortOrder: 'asc' } }, rules: true },
          });
          if (!row) throw new NotFoundError('ConfigurableProduct', id);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/configurator/products',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.CREATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const parsed = ConfigurableProductSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const row = await prisma.configurableProduct.create({
            data: {
              tenantId: jwt.tenantId,
              productId: parsed.data.productId,
              name: parsed.data.name,
              description: parsed.data.description ?? null,
              isActive: parsed.data.isActive ?? true,
            },
          });
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/configurator/products/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = UpdateConfigurableProductSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const existing = await prisma.configurableProduct.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) throw new NotFoundError('ConfigurableProduct', id);
          const row = await prisma.configurableProduct.update({
            where: { id },
            data: {
              productId: parsed.data.productId,
              name: parsed.data.name,
              description: parsed.data.description ?? undefined,
              isActive: parsed.data.isActive,
            },
          });
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/configurator/products/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.DELETE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const existing = await prisma.configurableProduct.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) throw new NotFoundError('ConfigurableProduct', id);
          await prisma.configurableProduct.delete({ where: { id } });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      // ── Option groups ────────────────────────────────────────────────────
      r.post(
        '/configurator/option-groups',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.CREATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const parsed = OptionGroupSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const parent = await prisma.configurableProduct.findFirst({
            where: { id: parsed.data.configurableProductId, tenantId: jwt.tenantId },
          });
          if (!parent) throw new NotFoundError('ConfigurableProduct', parsed.data.configurableProductId);
          const row = await prisma.optionGroup.create({
            data: {
              tenantId: jwt.tenantId,
              configurableProductId: parsed.data.configurableProductId,
              name: parsed.data.name,
              minSelect: parsed.data.minSelect ?? 0,
              maxSelect: parsed.data.maxSelect ?? 0,
              required: parsed.data.required ?? false,
              sortOrder: parsed.data.sortOrder ?? 0,
            },
          });
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/configurator/option-groups/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = UpdateOptionGroupSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const existing = await prisma.optionGroup.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) throw new NotFoundError('OptionGroup', id);
          const row = await prisma.optionGroup.update({
            where: { id },
            data: {
              name: parsed.data.name,
              minSelect: parsed.data.minSelect,
              maxSelect: parsed.data.maxSelect,
              required: parsed.data.required,
              sortOrder: parsed.data.sortOrder,
            },
          });
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/configurator/option-groups/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.DELETE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const existing = await prisma.optionGroup.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) throw new NotFoundError('OptionGroup', id);
          await prisma.optionGroup.delete({ where: { id } });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      // ── Options ──────────────────────────────────────────────────────────
      r.post(
        '/configurator/options',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.CREATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const parsed = ProductOptionSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const group = await prisma.optionGroup.findFirst({
            where: { id: parsed.data.optionGroupId, tenantId: jwt.tenantId },
          });
          if (!group) throw new NotFoundError('OptionGroup', parsed.data.optionGroupId);
          const row = await prisma.productOption.create({
            data: {
              tenantId: jwt.tenantId,
              optionGroupId: parsed.data.optionGroupId,
              name: parsed.data.name,
              sku: parsed.data.sku ?? null,
              priceDelta: parsed.data.priceDelta ?? 0,
              isDefault: parsed.data.isDefault ?? false,
              sortOrder: parsed.data.sortOrder ?? 0,
            },
          });
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/configurator/options/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = UpdateProductOptionSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const existing = await prisma.productOption.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) throw new NotFoundError('ProductOption', id);
          const row = await prisma.productOption.update({
            where: { id },
            data: {
              name: parsed.data.name,
              sku: parsed.data.sku ?? undefined,
              priceDelta: parsed.data.priceDelta,
              isDefault: parsed.data.isDefault,
              sortOrder: parsed.data.sortOrder,
            },
          });
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/configurator/options/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.DELETE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const existing = await prisma.productOption.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) throw new NotFoundError('ProductOption', id);
          await prisma.productOption.delete({ where: { id } });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      // ── Rules ────────────────────────────────────────────────────────────
      r.get(
        '/configurator/rules',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const query = z
            .object({ configurableProductId: z.string().min(1).optional() })
            .parse(request.query);
          const rows = await prisma.configRule.findMany({
            where: {
              tenantId: jwt.tenantId,
              ...(query.configurableProductId ? { configurableProductId: query.configurableProductId } : {}),
            },
            orderBy: { createdAt: 'desc' },
          });
          return reply.send({ success: true, data: rows });
        }
      );

      r.post(
        '/configurator/rules',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.CREATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const parsed = ConfigRuleSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          if (parsed.data.type !== 'PRICE_ADJUST' && !parsed.data.thenOptionId) {
            throw new ValidationError('Invalid body', {
              fieldErrors: { thenOptionId: ['thenOptionId is required for REQUIRES/EXCLUDES/AUTO_ADD rules'] },
              formErrors: [],
            });
          }
          if (parsed.data.type === 'PRICE_ADJUST' && (parsed.data.adjustment === null || parsed.data.adjustment === undefined)) {
            throw new ValidationError('Invalid body', {
              fieldErrors: { adjustment: ['adjustment is required for PRICE_ADJUST rules'] },
              formErrors: [],
            });
          }
          const parent = await prisma.configurableProduct.findFirst({
            where: { id: parsed.data.configurableProductId, tenantId: jwt.tenantId },
          });
          if (!parent) throw new NotFoundError('ConfigurableProduct', parsed.data.configurableProductId);
          const row = await prisma.configRule.create({
            data: {
              tenantId: jwt.tenantId,
              configurableProductId: parsed.data.configurableProductId,
              name: parsed.data.name,
              type: parsed.data.type,
              whenOptionId: parsed.data.whenOptionId,
              thenOptionId: parsed.data.thenOptionId ?? null,
              adjustment: parsed.data.adjustment ?? null,
              isActive: parsed.data.isActive ?? true,
            },
          });
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/configurator/rules/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = UpdateConfigRuleSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const existing = await prisma.configRule.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) throw new NotFoundError('ConfigRule', id);
          const row = await prisma.configRule.update({
            where: { id },
            data: {
              name: parsed.data.name,
              type: parsed.data.type,
              whenOptionId: parsed.data.whenOptionId,
              thenOptionId: parsed.data.thenOptionId ?? undefined,
              adjustment: parsed.data.adjustment ?? undefined,
              isActive: parsed.data.isActive,
            },
          });
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/configurator/rules/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.DELETE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const existing = await prisma.configRule.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) throw new NotFoundError('ConfigRule', id);
          await prisma.configRule.delete({ where: { id } });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      // ── Validate ─────────────────────────────────────────────────────────
      r.post(
        '/configurator/validate',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.CREATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const parsed = ValidateSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const result = await configurator.validateConfiguration(
            jwt.tenantId,
            parsed.data.configurableProductId,
            parsed.data.selectedOptionIds
          );
          return reply.send({ success: true, data: result });
        }
      );

      // ── Apply to quote (materialize line items) ──────────────────────────
      r.post(
        '/configurator/apply-to-quote',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const parsed = ApplyToQuoteSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const result = await configurator.applyToQuote(jwt.tenantId, {
            quoteId: parsed.data.quoteId,
            configurableProductId: parsed.data.configurableProductId,
            selectedOptionIds: parsed.data.selectedOptionIds,
            actorId: jwt.sub,
          });
          if (!result.applied) {
            return reply.code(422).send({
              success: false,
              error: 'INVALID_CONFIGURATION',
              message: 'Configuration is invalid and was not applied to the quote.',
              data: { violations: result.validation.violations, validation: result.validation },
            });
          }
          return reply.send({
            success: true,
            data: {
              quote: result.quote,
              addedLineItems: result.addedLineItems,
              validation: result.validation,
            },
          });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
