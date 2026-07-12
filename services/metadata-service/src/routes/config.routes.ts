import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { z } from 'zod';
import type { MetadataPrisma } from '../prisma.js';
import {
  CONFIG_ENTITY_GROUPS,
  createConfigService,
  type ConfigBundle,
  type ConfigEntityGroup,
} from '../services/config.service.js';

const ImportBody = z.object({
  bundle: z.object({}).passthrough(),
  mode: z.enum(['DRY_RUN', 'APPLY']).default('DRY_RUN'),
  conflict: z.enum(['SKIP', 'OVERWRITE']).default('SKIP'),
});

/** Parse `?include=a,b,c` (and repeated params) into a validated group list. */
function parseInclude(raw: unknown): ConfigEntityGroup[] {
  if (raw === undefined || raw === null || raw === '') return [...CONFIG_ENTITY_GROUPS];
  const parts = (Array.isArray(raw) ? raw : [raw])
    .flatMap((v) => String(v).split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return [...CONFIG_ENTITY_GROUPS];
  const valid = new Set<string>(CONFIG_ENTITY_GROUPS);
  const bad = parts.filter((p) => !valid.has(p));
  if (bad.length) {
    throw new ValidationError(`Unknown include group(s): ${bad.join(', ')}`, {
      allowed: [...CONFIG_ENTITY_GROUPS],
    });
  }
  return parts as ConfigEntityGroup[];
}

/**
 * Config-as-data: export/import a tenant's low-code customization bundle between
 * environments. Settings-gated exactly like the rest of the low-code surface.
 * Import always rebinds to the CALLING tenant (never the bundle's source tenant).
 */
export async function registerConfigRoutes(app: FastifyInstance, prisma: MetadataPrisma): Promise<void> {
  const service = createConfigService(prisma);

  await app.register(
    async (r) => {
      const READ = { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) };
      const WRITE = { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) };

      // Export the customization bundle. `?include=customFields,customModules,...`
      r.get('/config/export', READ, async (request, reply) => {
        const q = request.query as Record<string, unknown>;
        const include = parseInclude(q.include);
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.exportConfig(jwt.tenantId, include) });
      });

      // Import a bundle. DRY_RUN returns the diff without writing; APPLY upserts
      // transactionally into the caller's tenant and is idempotent.
      r.post('/config/import', WRITE, async (request, reply) => {
        const parsed = ImportBody.safeParse(request.body);
        if (!parsed.success) throw new ValidationError('Invalid body', parsed.error.flatten());
        const jwt = request.user as JwtPayload;
        const summary = await service.importConfig(jwt.tenantId, {
          bundle: parsed.data.bundle as unknown as ConfigBundle,
          mode: parsed.data.mode,
          conflict: parsed.data.conflict,
        });
        return reply.send({ success: true, data: summary });
      });

      // Audit trail of prior imports (DRY_RUN + APPLY), newest first.
      r.get('/config/import-logs', READ, async (request, reply) => {
        const q = request.query as Record<string, string | undefined>;
        const limit = q.limit ? Number(q.limit) : 50;
        const jwt = request.user as JwtPayload;
        return reply.send({ success: true, data: await service.listImportLogs(jwt.tenantId, limit) });
      });
    },
    { prefix: '/api/v1' }
  );
}
