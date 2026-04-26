import { randomUUID } from 'node:crypto';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '@nexus/service-utils';
import type * as Minio from 'minio';
import type { FileAttachment } from '../../../../node_modules/.prisma/storage-client/index.js';
import type { StoragePrisma } from '../prisma.js';

const ENTITY_TYPES = new Set(['DEAL', 'CONTACT', 'ACCOUNT', 'LEAD', 'QUOTE']);

export function createFilesService(prisma: StoragePrisma, minio: Minio.Client, bucket: string) {
  return {
    async uploadFile(
      tenantId: string,
      uploadedBy: string,
      entityType: string,
      entityId: string,
      file: { filename: string; mimeType: string; sizeBytes: number; buffer: Buffer }
    ): Promise<FileAttachment> {
      if (!ENTITY_TYPES.has(entityType)) {
        throw new BusinessRuleError(`Invalid entityType: ${entityType}`);
      }
      const safeName = file.filename.replace(/[/\\]/g, '_');
      const storedKey = `${tenantId}/${entityType}/${entityId}/${randomUUID()}-${safeName}`;
      await minio.putObject(bucket, storedKey, file.buffer, file.sizeBytes, {
        'Content-Type': file.mimeType,
      });
      return prisma.fileAttachment.create({
        data: {
          tenantId,
          uploadedBy,
          entityType,
          entityId,
          filename: file.filename,
          storedKey,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        },
      });
    },

    async listFiles(
      tenantId: string,
      entityType: string,
      entityId: string
    ): Promise<FileAttachment[]> {
      if (!ENTITY_TYPES.has(entityType)) {
        throw new BusinessRuleError(`Invalid entityType: ${entityType}`);
      }
      return prisma.fileAttachment.findMany({
        where: { tenantId, entityType, entityId },
        orderBy: { createdAt: 'desc' },
      });
    },

    async getDownloadUrl(
      tenantId: string,
      fileId: string,
      expirySeconds = 3600
    ): Promise<{ url: string; expiresAt: string }> {
      const row = await prisma.fileAttachment.findFirst({ where: { id: fileId, tenantId } });
      if (!row) throw new NotFoundError('FileAttachment', fileId);
      const url = await minio.presignedGetObject(bucket, row.storedKey, expirySeconds);
      const expiresAt = new Date(Date.now() + expirySeconds * 1000).toISOString();
      return { url, expiresAt };
    },

    async deleteFile(
      tenantId: string,
      fileId: string,
      requestingUserId: string,
      roles: string[]
    ): Promise<void> {
      const row = await prisma.fileAttachment.findFirst({ where: { id: fileId, tenantId } });
      if (!row) throw new NotFoundError('FileAttachment', fileId);
      const isAdmin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
      if (row.uploadedBy !== requestingUserId && !isAdmin) {
        throw new ForbiddenError('Only the uploader or an admin can delete this file');
      }
      await minio.removeObject(bucket, row.storedKey);
      await prisma.fileAttachment.delete({ where: { id: fileId } });
    },
  };
}
