import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { z } from 'zod';
import { IdParamSchema } from '@nexus/validation';
import type { MetadataPrisma } from '../prisma.js';
import { createTranslationsService, TRANSLATION_ENTITY_TYPES } from '../services/translations.service.js';

const EntityTypeEnum = z.enum(TRANSLATION_ENTITY_TYPES);

const CreateBody = z.object({
  entityType: EntityTypeEnum,
  entityKey: z.string().min(1).max(200),
  locale: z.string().min(2).max(35),
  value: z.string().min(1).max(2000),
});
// Upsert-by-natural-key variant (no id in the path).
const UpsertBody = CreateBody;
const UpdateBody = z.object({ value: z.string().min(1).max(2000) });

/**
 * Label localization CRUD + resolve. Reads are settings-read gated; the
 * `resolve` map (consumed on every localized page render) is intentionally
 * available to any authenticated caller with settings-read so the UI can merge
 * it. Mutations require settings-update.
 */
export async function registerTranslationsRoutes(app: FastifyInstance, prisma: MetadataPrisma): Promise<void> {
  const service = createTranslationsService(prisma);

  await app.register(
    async (r) => {
      const READ = { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) };
      const WRITE = { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) };

      // Resolve a locale → { entityKey: value } map (base label used when absent).
      r.get('/translations/resolve', READ, async (request, reply) => {
        const q = request.query as Record<string, string | undefined>;
        if (!q.locale) throw new ValidationError('locale query param is required', {});
        let entityType: (typeof TRANSLATION_ENTITY_TYPES)[number] | undefined;
        if (q.entityType) {
          const p = EntityTypeEnum.safeParse(q.entityType);
          if (!p.success) throw new ValidationError('Invalid entityType', p.error.flatten());
          entityType = p.data;
        }
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.resolve(jwt.tenantId, q.locale, entityType) });
      });

      // List (optionally filtered by entityType / locale / entityKey).
      r.get('/translations', READ, async (request, reply) => {
        const q = request.query as Record<string, string | undefined>;
        const filter: { entityType?: (typeof TRANSLATION_ENTITY_TYPES)[number]; locale?: string; entityKey?: string } = {};
        if (q.entityType) {
          const p = EntityTypeEnum.safeParse(q.entityType);
          if (!p.success) throw new ValidationError('Invalid entityType', p.error.flatten());
          filter.entityType = p.data;
        }
        if (q.locale) filter.locale = q.locale;
        if (q.entityKey) filter.entityKey = q.entityKey;
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.list(jwt.tenantId, filter) });
      });

      // Upsert by natural key — convenient for idempotent config flows.
      r.put('/translations', WRITE, async (request, reply) => {
        const parsed = UpsertBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.upsert(jwt.tenantId, parsed.data) });
      });

      r.post('/translations', WRITE, async (request, reply) => {
        const parsed = CreateBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.code(201).send({ success: true, data: await service.create(jwt.tenantId, parsed.data) });
      });

      r.get('/translations/:id', READ, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.get(jwt.tenantId, id) });
      });

      r.patch('/translations/:id', WRITE, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const parsed = UpdateBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.update(jwt.tenantId, id, parsed.data) });
      });

      r.delete('/translations/:id', WRITE, async (request, reply) => {
        const { id } = IdParamSchema.parse(request.params);
        const jwt = request.user as JwtPayload;
        await service.remove(jwt.tenantId, id);
        return reply.send({ success: true, data: { id, deleted: true } });
      });
    },
    { prefix: '/api/v1' }
  );
}
