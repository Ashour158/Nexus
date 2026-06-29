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
      body.columns
    );
    reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="${module}-export.csv"`);
    return reply.send(csv);
  });
}
