import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import type { MetadataPrisma } from '../prisma.js';
import {
  createFeatureFlagsService,
  type FlagInput,
  type FlagPatch,
} from '../services/feature-flags.service.js';

function parsePatch(body: unknown): FlagPatch {
  const b = (body ?? {}) as Record<string, unknown>;
  const patch: FlagPatch = {};
  if (b.enabled !== undefined) {
    if (typeof b.enabled !== 'boolean') throw new ValidationError('`enabled` must be a boolean');
    patch.enabled = b.enabled;
  }
  if (b.description !== undefined) {
    patch.description = b.description === null ? null : String(b.description);
  }
  if (b.rollout !== undefined) patch.rollout = Number(b.rollout);
  if (b.tenants !== undefined) {
    if (!Array.isArray(b.tenants)) throw new ValidationError('`tenants` must be an array');
    patch.tenants = b.tenants.map(String);
  }
  if (b.users !== undefined) patch.users = String(b.users);
  return patch;
}

export async function registerFeatureFlagsRoutes(
  app: FastifyInstance,
  prisma: MetadataPrisma
): Promise<void> {
  const service = createFeatureFlagsService(prisma);

  await app.register(
    async (r) => {
      // List all durable flags for the tenant.
      r.get(
        '/feature-flags',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          const rows = await service.listFlags(jwt.tenantId);
          return reply.send({ success: true, data: rows });
        }
      );

      // Upsert a single flag by key (partial patch; typically { enabled }).
      r.put(
        '/feature-flags/:key',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { key } = request.params as { key: string };
          if (!key) throw new ValidationError('flag key is required');
          const patch = parsePatch(request.body);
          const jwt = request.user as JwtPayload;
          const row = await service.upsertFlag(jwt.tenantId, key, patch, jwt.sub || 'admin');
          return reply.send({ success: true, data: row });
        }
      );

      // Bulk upsert: replace/patch the whole flag set in one call.
      r.post(
        '/feature-flags',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const body = (request.body ?? {}) as { flags?: unknown };
          if (!Array.isArray(body.flags)) {
            throw new ValidationError('`flags` must be an array');
          }
          const flags: FlagInput[] = body.flags.map((raw) => {
            const item = (raw ?? {}) as Record<string, unknown>;
            const key = typeof item.key === 'string' ? item.key : String(item.name ?? '');
            if (!key) throw new ValidationError('each flag needs a `key` (or `name`)');
            return { key, ...parsePatch(item) };
          });
          const jwt = request.user as JwtPayload;
          const rows = await service.bulkUpsert(jwt.tenantId, flags, jwt.sub || 'admin');
          return reply.send({ success: true, data: rows });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
