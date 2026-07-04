import { randomUUID } from 'node:crypto';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '@nexus/service-utils';
import type * as Minio from 'minio';
import type { FileAttachment } from '../../../../node_modules/.prisma/storage-client/index.js';
import type { StoragePrisma } from '../prisma.js';
import { emitFileEvent } from './storage-events.js';
import { createUsageService, type UsageService } from './usage.service.js';

const ENTITY_TYPES = new Set(['DEAL', 'CONTACT', 'ACCOUNT', 'LEAD', 'QUOTE']);

export function createFilesService(
  prisma: StoragePrisma,
  minio: Minio.Client,
  bucket: string,
  usage: UsageService = createUsageService(prisma)
) {
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
      // Quota check (fail-open: a lookup failure allows the upload). Only rejects
      // when a positive STORAGE_TENANT_QUOTA_BYTES is configured and exceeded.
      const quota = await usage.checkQuota(tenantId, file.sizeBytes);
      if (!quota.allowed) {
        throw new BusinessRuleError(
          `Storage quota exceeded: ${quota.bytesUsed ?? 0} + ${file.sizeBytes} bytes would exceed the ${quota.quotaBytes ?? 0}-byte tenant quota`
        );
      }
      const safeName = file.filename.replace(/[/\\]/g, '_');
      const storedKey = `${tenantId}/${entityType}/${entityId}/${randomUUID()}-${safeName}`;
      await minio.putObject(bucket, storedKey, file.buffer, file.sizeBytes, {
        'Content-Type': file.mimeType,
      });
      const row = await prisma.fileAttachment.create({
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
      // Side effects below are additive + fail-open: neither may fail the upload.
      await usage.recordUpload(tenantId, file.sizeBytes);
      await emitFileEvent('file.uploaded', tenantId, {
        fileId: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        filename: row.filename,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        uploadedBy: row.uploadedBy,
        storedKey: row.storedKey,
      });
      return row;
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

    async listAllFiles(
      tenantId: string,
      opts?: { limit?: number; offset?: number; entityType?: string }
    ): Promise<FileAttachment[]> {
      return prisma.fileAttachment.findMany({
        where: {
          tenantId,
          ...(opts?.entityType ? { entityType: opts.entityType } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: opts?.limit ?? 50,
        skip: opts?.offset ?? 0,
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
      // Additive + fail-open side effects: never let these fail the delete.
      await usage.recordDelete(tenantId, row.sizeBytes);
      await emitFileEvent('file.deleted', tenantId, {
        fileId: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        filename: row.filename,
        sizeBytes: row.sizeBytes,
        deletedBy: requestingUserId,
        storedKey: row.storedKey,
      });
    },

    /** Current per-tenant usage snapshot (bytes stored, file count, quota). */
    async getUsage(tenantId: string) {
      return usage.getUsage(tenantId);
    },
  };
}
