import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { CrmPrisma } from '../prisma.js';

const CreateCustomFieldSchema = z.object({
  entityType: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  apiKey: z.string().max(120).optional(),
  fieldType: z.string().min(1).max(40),
  options: z.unknown().optional(),
  required: z.boolean().optional(),
  showOnCard: z.boolean().optional(),
  position: z.number().optional(),
});

/**
 * Custom field DEFINITIONS for built-in entities (account/contact/deal/lead) —
 * the low-code layer. Definitions live in crm-service's `CustomFieldDefinition`
 * table (same store the write-time validator in lib/custom-field-validation.ts
 * reads), so admin-defined fields are enforced on Account/Contact writes and
 * rendered on the record pages. Tenant is always derived from the verified JWT.
 */
export async function registerCustomFieldsRoutes(app: FastifyInstance, prisma: CrmPrisma): Promise<void> {
  const p = prisma as unknown as {
    customFieldDefinition: {
      findMany: (a: unknown) => Promise<unknown[]>;
      create: (a: unknown) => Promise<unknown>;
      updateMany: (a: unknown) => Promise<{ count: number }>;
    };
  };

  // List definitions (optionally filtered by entityType).
  app.get(
    '/api/v1/custom-fields',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
    async (req, reply) => {
      const jwt = (req as { user: JwtPayload }).user;
      const { entityType } = req.query as { entityType?: string };
      const data = await p.customFieldDefinition.findMany({
        where: {
          tenantId: jwt.tenantId,
          isActive: true,
          ...(entityType ? { entityType } : {}),
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
      return reply.send({ success: true, data });
    }
  );

  // Create a definition.
  app.post(
    '/api/v1/custom-fields',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (req, reply) => {
      const jwt = (req as { user: JwtPayload }).user;
      const parsed = CreateCustomFieldSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError('Invalid body', parsed.error.flatten());
      }
      const b = parsed.data;
      const apiKey = (b.apiKey || b.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const created = await p.customFieldDefinition.create({
        data: {
          tenantId: jwt.tenantId,
          entityType: b.entityType,
          name: b.name,
          apiKey,
          fieldType: b.fieldType,
          options: (b.options ?? []) as never,
          required: Boolean(b.required),
          showOnCard: Boolean(b.showOnCard),
          position: Number.isFinite(b.position) ? Number(b.position) : 0,
        },
      });
      return reply.status(201).send({ success: true, data: created });
    }
  );

  // Soft-delete a definition (kept for history; validation stops applying it).
  app.delete(
    '/api/v1/custom-fields/:id',
    { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
    async (req, reply) => {
      const jwt = (req as { user: JwtPayload }).user;
      const { id } = req.params as { id: string };
      const res = await p.customFieldDefinition.updateMany({
        where: { id, tenantId: jwt.tenantId },
        data: { isActive: false },
      });
      return reply.send({ success: true, data: { id, deleted: res.count > 0 } });
    }
  );
}
