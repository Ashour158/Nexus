import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { FinancePrisma } from '../prisma.js';

const RuleSchema = z.object({
  name: z.string().trim().min(3),
  isActive: z.boolean().optional(),
  trigger: z.enum(['deal_stage_changed', 'rfq_received', 'deal_created', 'quote_expiring', 'discount_requested']),
  conditions: z.record(z.unknown()).refine((value) => Object.keys(value).length > 0, 'At least one condition is required'),
  templateId: z.string().cuid().optional().nullable(),
  priceBookId: z.string().cuid().optional().nullable(),
  actions: z.array(
    z.record(z.unknown()).refine(
      (value) => ['create_quote', 'assign_owner', 'request_approval', 'render_template', 'send_notification'].includes(String(value.type ?? '')),
      'Unsupported action type'
    )
  ).min(1),
});

export async function registerQuoteAutomationRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/quote-automation-rules', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.READ) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rows = await prisma.quoteAutomationRule.findMany({
          where: { tenantId: jwt.tenantId },
          orderBy: { createdAt: 'desc' },
        });
        return reply.send({ success: true, data: rows });
      });

      r.post('/quote-automation-rules', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.CREATE) }, async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const parsed = RuleSchema.parse(request.body);
        const row = await prisma.quoteAutomationRule.create({
          data: {
            tenantId: jwt.tenantId,
            name: parsed.name,
            isActive: parsed.isActive ?? true,
            trigger: parsed.trigger,
            conditions: parsed.conditions,
            templateId: parsed.templateId ?? null,
            priceBookId: parsed.priceBookId ?? null,
            actions: parsed.actions,
          },
        });
        return reply.code(201).send({ success: true, data: row });
      });

      r.patch('/quote-automation-rules/:id', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.UPDATE) }, async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        const parsed = RuleSchema.partial().parse(request.body);
        const row = await prisma.quoteAutomationRule.update({
          where: { id },
          data: parsed,
        });
        return reply.send({ success: true, data: row });
      });

      r.delete('/quote-automation-rules/:id', { preHandler: requirePermission(PERMISSIONS.WORKFLOWS.DELETE) }, async (request, reply) => {
        const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
        await prisma.quoteAutomationRule.delete({ where: { id } });
        return reply.send({ success: true, data: { id, deleted: true } });
      });
    },
    { prefix: '/api/v1' }
  );
}

