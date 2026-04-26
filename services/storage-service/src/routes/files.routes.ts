import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '@nexus/shared-types';
import { PERMISSIONS, requirePermission, ValidationError } from '@nexus/service-utils';
import { z } from 'zod';
import type { createFilesService } from '../services/files.service.js';

const EntityParams = z.object({
  entityType: z.enum(['DEAL', 'CONTACT', 'ACCOUNT', 'LEAD', 'QUOTE']),
  entityId: z.string().min(1),
});

export async function registerFilesRoutes(
  app: FastifyInstance,
  files: ReturnType<typeof createFilesService>
): Promise<void> {
  await app.register(
    async (r) => {
      r.post(
        '/files/upload',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const jwt = request.user as JwtPayload;
          let buffer: Buffer | null = null;
          let filename = 'upload.bin';
          let mimetype = 'application/octet-stream';
          let entityType: string | undefined;
          let entityId: string | undefined;
          const parts = request.parts();
          for await (const part of parts) {
            if (part.type === 'file' && part.fieldname === 'file') {
              const chunks: Buffer[] = [];
              for await (const ch of part.file) {
                chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
              }
              buffer = Buffer.concat(chunks);
              filename = part.filename || filename;
              mimetype = part.mimetype || mimetype;
            } else if (part.type === 'field') {
              if (part.fieldname === 'entityType') entityType = String(part.value);
              if (part.fieldname === 'entityId') entityId = String(part.value);
            }
          }
          if (!buffer) {
            throw new ValidationError('Invalid multipart', { file: ['required'] });
          }
          if (!entityType || !entityId) {
            throw new ValidationError('Invalid fields', { entityType: ['required'], entityId: ['required'] });
          }
          const parsed = z
            .object({ entityType: EntityParams.shape.entityType, entityId: z.string() })
            .safeParse({ entityType, entityId });
          if (!parsed.success) throw new ValidationError('Invalid fields', parsed.error.flatten());
          const row = await files.uploadFile(jwt.tenantId, jwt.sub, parsed.data.entityType, parsed.data.entityId, {
            filename,
            mimeType: mimetype,
            sizeBytes: buffer.length,
            buffer,
          });
          return reply.code(201).send({ success: true, data: row });
        }
      );

      r.get(
        '/files/:entityType/:entityId',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const p = EntityParams.parse(request.params);
          const jwt = request.user as JwtPayload;
          const rows = await files.listFiles(jwt.tenantId, p.entityType, p.entityId);
          return reply.send({ success: true, data: rows });
        }
      );

      r.get(
        '/files/:id/download-url',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.READ) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string() }).parse(request.params);
          const q = z
            .object({ expirySeconds: z.coerce.number().min(60).max(86400).optional() })
            .parse(request.query);
          const jwt = request.user as JwtPayload;
          const result = await files.getDownloadUrl(jwt.tenantId, id, q.expirySeconds ?? 3600);
          return reply.send({ success: true, data: result });
        }
      );

      r.delete(
        '/files/:id',
        { preHandler: requirePermission(PERMISSIONS.SETTINGS.UPDATE) },
        async (request, reply) => {
          const { id } = z.object({ id: z.string() }).parse(request.params);
          const jwt = request.user as JwtPayload;
          await files.deleteFile(jwt.tenantId, id, jwt.sub, jwt.roles ?? []);
          return reply.send({ success: true, data: { id, deleted: true } });
        }
      );
    },
    { prefix: '/api/v1' }
  );
}
