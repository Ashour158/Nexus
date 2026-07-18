import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { NotFoundError, PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { FinancePrisma } from '../prisma.js';
import { createGuidedSellingService } from '../services/guided-selling.js';

const IdParam = z.object({ id: z.string().min(1) });

const FlowSchema = z.object({
  name: z.string().min(1),
  module: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});
const UpdateFlowSchema = FlowSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'At least one field is required',
});

const QuestionSchema = z.object({
  flowId: z.string().min(1),
  prompt: z.string().min(1),
  answerType: z.enum(['SINGLE', 'MULTI', 'BOOLEAN', 'NUMBER']).optional(),
  options: z.unknown().optional(),
  sortOrder: z.number().int().optional(),
});
const UpdateQuestionSchema = QuestionSchema.omit({ flowId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const RuleSchema = z.object({
  flowId: z.string().min(1),
  name: z.string().min(1),
  conditions: z.record(z.unknown()).optional(),
  recommendedProductIds: z.array(z.string().min(1)).optional(),
  recommendedOptionIds: z.array(z.string().min(1)).optional(),
  weight: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
const UpdateRuleSchema = RuleSchema.omit({ flowId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const RecommendSchema = z.object({
  answers: z.record(z.unknown()).default({}),
});

export async function registerGuidedSellingRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  const guided = createGuidedSellingService(prisma);

  await app.register(
    async (r) => {
      // ── Flows ────────────────────────────────────────────────────────────
      r.get(
        '/guided-selling/flows',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const rows = await prisma.guidedSellingFlow.findMany({
            where: { tenantId: jwt.tenantId },
            include: { questions: { orderBy: { sortOrder: 'asc' } }, rules: true },
            orderBy: { createdAt: 'desc' },
          });
          return reply.send({ success: true, data: rows });
        }
      );

      r.get(
        '/guided-selling/flows/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const row = await prisma.guidedSellingFlow.findFirst({
            where: { id, tenantId: jwt.tenantId },
            include: { questions: { orderBy: { sortOrder: 'asc' } }, rules: true },
          });
          if (!row) throw new NotFoundError('GuidedSellingFlow', id);
          return reply.send({ success: true, data: row });
        }
      );

      r.post(
        '/guided-selling/flows',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.CREATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const parsed = FlowSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const row = await prisma.guidedSellingFlow.create({
            data: {
              tenantId: jwt.tenantId,
              name: parsed.data.name,
              module: parsed.data.module ?? 'quote',
              isActive: parsed.data.isActive ?? true,
            },
          });
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/guided-selling/flows/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = UpdateFlowSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const existing = await prisma.guidedSellingFlow.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) throw new NotFoundError('GuidedSellingFlow', id);
          const row = await prisma.guidedSellingFlow.update({
            where: { id },
            data: { name: parsed.data.name, module: parsed.data.module, isActive: parsed.data.isActive },
          });
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/guided-selling/flows/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.DELETE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const existing = await prisma.guidedSellingFlow.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) throw new NotFoundError('GuidedSellingFlow', id);
          await prisma.guidedSellingFlow.delete({ where: { id } });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      // ── Questions ────────────────────────────────────────────────────────
      r.post(
        '/guided-selling/questions',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.CREATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const parsed = QuestionSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const flow = await prisma.guidedSellingFlow.findFirst({
            where: { id: parsed.data.flowId, tenantId: jwt.tenantId },
          });
          if (!flow) throw new NotFoundError('GuidedSellingFlow', parsed.data.flowId);
          const row = await prisma.guidedSellingQuestion.create({
            data: {
              tenantId: jwt.tenantId,
              flowId: parsed.data.flowId,
              prompt: parsed.data.prompt,
              answerType: parsed.data.answerType ?? 'SINGLE',
              options: (parsed.data.options ?? undefined) as never,
              sortOrder: parsed.data.sortOrder ?? 0,
            },
          });
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/guided-selling/questions/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = UpdateQuestionSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const existing = await prisma.guidedSellingQuestion.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) throw new NotFoundError('GuidedSellingQuestion', id);
          const row = await prisma.guidedSellingQuestion.update({
            where: { id },
            data: {
              prompt: parsed.data.prompt,
              answerType: parsed.data.answerType,
              options: parsed.data.options === undefined ? undefined : (parsed.data.options as never),
              sortOrder: parsed.data.sortOrder,
            },
          });
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/guided-selling/questions/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.DELETE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const existing = await prisma.guidedSellingQuestion.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) throw new NotFoundError('GuidedSellingQuestion', id);
          await prisma.guidedSellingQuestion.delete({ where: { id } });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      // ── Rules ────────────────────────────────────────────────────────────
      r.post(
        '/guided-selling/rules',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.CREATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const parsed = RuleSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const flow = await prisma.guidedSellingFlow.findFirst({
            where: { id: parsed.data.flowId, tenantId: jwt.tenantId },
          });
          if (!flow) throw new NotFoundError('GuidedSellingFlow', parsed.data.flowId);
          const row = await prisma.guidedSellingRule.create({
            data: {
              tenantId: jwt.tenantId,
              flowId: parsed.data.flowId,
              name: parsed.data.name,
              conditions: (parsed.data.conditions ?? {}) as never,
              recommendedProductIds: parsed.data.recommendedProductIds ?? [],
              recommendedOptionIds: parsed.data.recommendedOptionIds ?? [],
              weight: parsed.data.weight ?? 1,
              isActive: parsed.data.isActive ?? true,
            },
          });
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.patch(
        '/guided-selling/rules/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = UpdateRuleSchema.safeParse(request.body);
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const existing = await prisma.guidedSellingRule.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) throw new NotFoundError('GuidedSellingRule', id);
          const row = await prisma.guidedSellingRule.update({
            where: { id },
            data: {
              name: parsed.data.name,
              conditions: parsed.data.conditions === undefined ? undefined : (parsed.data.conditions as never),
              recommendedProductIds: parsed.data.recommendedProductIds,
              recommendedOptionIds: parsed.data.recommendedOptionIds,
              weight: parsed.data.weight,
              isActive: parsed.data.isActive,
            },
          });
          return reply.send({ success: true, data: row });
        }
      );

      r.delete(
        '/guided-selling/rules/:id',
        { preHandler: requirePermission(PERMISSIONS.PRODUCTS.DELETE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const existing = await prisma.guidedSellingRule.findFirst({ where: { id, tenantId: jwt.tenantId } });
          if (!existing) throw new NotFoundError('GuidedSellingRule', id);
          await prisma.guidedSellingRule.delete({ where: { id } });
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );

      // ── Recommend ────────────────────────────────────────────────────────
      r.post(
        '/guided-selling/flows/:id/recommend',
        { preHandler: requirePermission(PERMISSIONS.QUOTES.CREATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const { id } = IdParam.parse(request.params);
          const parsed = RecommendSchema.safeParse(request.body ?? {});
          if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
          const result = await guided.recommend(jwt.tenantId, id, parsed.data.answers as never);
          return reply.send({ success: true, data: result });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
