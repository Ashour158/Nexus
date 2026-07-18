import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PERMISSIONS, requirePermission } from '@nexus/service-utils';
import type { DataPrisma } from '../prisma.js';
import { createExportService } from '../services/export.service.js';

const ParamsSchema = z.object({ module: z.string().min(1) });
const BodySchema = z.object({
  filters: z.record(z.unknown()).optional(),
  columns: z.array(z.string()).optional(),
});

// New generic export: module lives in the body and a `format` (csv|json) is
// selectable. `filter` is accepted as an alias for `filters`.
const GenericBodySchema = z.object({
  module: z.string().min(1),
  filter: z.record(z.unknown()).optional(),
  filters: z.record(z.unknown()).optional(),
  columns: z.array(z.string()).optional(),
  format: z.enum(['csv', 'json']).default('csv'),
});

export async function registerExportRoutes(app: FastifyInstance, prisma: DataPrisma) {
  const service = createExportService(prisma);

  app.post('/api/v1/export/:module', { preHandler: requirePermission(PERMISSIONS.DATA.EXPORT) }, async (request, reply) => {
    const { module } = ParamsSchema.parse(request.params);
    const body = BodySchema.parse(request.body);
    const user = (request as any).user as { tenantId: string };
    const csv = await service.exportCsv(
      user.tenantId,
      module,
      body.filters,
      body.columns,
      request.headers.authorization
    );
    reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="${module}-export.csv"`);
    return reply.send(csv);
  });

  app.post('/api/v1/export', { preHandler: requirePermission(PERMISSIONS.DATA.EXPORT) }, async (request, reply) => {
    const body = GenericBodySchema.parse(request.body);
    const user = (request as any).user as { tenantId: string };
    const result = await service.exportData(
      user.tenantId,
      body.module,
      body.filter ?? body.filters,
      body.columns,
      body.format,
      request.headers.authorization
    );
    const ext = result.format === 'json' ? 'json' : 'csv';
    reply
      .header('Content-Type', result.contentType)
      .header('Content-Disposition', `attachment; filename="${body.module}-export.${ext}"`);
    return reply.send(result.payload);
  });
}
