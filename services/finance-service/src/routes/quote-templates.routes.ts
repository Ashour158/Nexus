import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import type { FinancePrisma } from '../prisma.js';

const TemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  storageKey: z.string().min(1),
  variables: z.array(z.record(z.unknown())).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  language: z.enum(['en', 'ar']).optional(),
});

export async function registerQuoteTemplateRoutes(
  app: FastifyInstance,
  prisma: FinancePrisma
): Promise<void> {
  await app.register(
    async (r) => {
      r.get('/quote-templates', async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const rows = await prisma.quoteTemplate.findMany({
          where: { tenantId: jwt.tenantId },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        });
        return reply.send({ success: true, data: rows });
      });

      r.post('/quote-templates', async (request, reply) => {
        const jwt = request.user as JwtPayload;
        const parsed = TemplateSchema.parse(request.body);
        if (parsed.isDefault) {
          await prisma.quoteTemplate.updateMany({
            where: { tenantId: jwt.tenantId, isDefault: true },
            data: { isDefault: false },
          });
        }
        const row = await prisma.quoteTemplate.create({
          data: {
            tenantId: jwt.tenantId,
            name: parsed.name,
            description: parsed.description,
            storageKey: parsed.storageKey,
            variables: parsed.variables ?? [],
            isDefault: parsed.isDefault ?? false,
            isActive: parsed.isActive ?? true,
            language: parsed.language ?? 'en',
          },
        });
        return reply.code(201).send({ success: true, data: row });
      });
    },
    { prefix: '/api/v1' }
  );
}

