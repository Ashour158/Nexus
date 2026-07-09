import { randomUUID } from 'node:crypto';
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from '@nexus/service-utils';
import type * as Minio from 'minio';
import type { FileAttachment } from '../../../../node_modules/.prisma/storage-client/index.js';
import type { StoragePrisma } from '../prisma.js';
import { emitFileEvent } from './storage-events.js';
import { createUsageService, type UsageService } from './usage.service.js';

const ENTITY_TYPES = new Set(['DEAL', 'CONTACT', 'ACCOUNT', 'LEAD', 'QUOTE']);

// SEC-20: allowlist for uploaded content. Anything not on this list is rejected
// before it ever reaches MinIO, so a client cannot smuggle in active content
// (text/html, image/svg+xml, scripts, executables) that could be served inline.
const ALLOWED_MIME_TYPES = new Set([
  // documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // plain text / data (rendered as attachment only, see getDownloadUrl)
  'text/plain',
  'text/csv',
  // images (raster only — svg is excluded on purpose)
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
]);

// Extensions that must never be accepted, even if the MIME type looks benign.
const BLOCKED_EXTENSIONS = new Set([
  'html', 'htm', 'xhtml', 'svg', 'js', 'mjs', 'exe', 'sh', 'bat', 'cmd',
  'com', 'msi', 'dll', 'scr', 'ps1', 'vbs', 'jar',
]);

function assertAllowedFile(filename: string, mimeType: string): void {
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new ValidationError(`File type not allowed: .${ext} files are rejected`, {
      filename: ['disallowed extension'],
    });
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
    throw new ValidationError(`File type not allowed: ${mimeType} is not an accepted content type`, {
      mimeType: ['disallowed content type'],
    });
  }
}

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
      // SEC-20: reject disallowed/active content types before touching storage.
      assertAllowedFile(file.filename, file.mimeType);
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
      // SEC-20: force attachment disposition so the object is downloaded, never
      // rendered inline. We cannot set headers on the presigned URL directly, so
      // we bake response-content-disposition into the signed request (S3/MinIO
      // honours it and it is part of the signature, so a client cannot strip it).
      const safeName = row.filename.replace(/[\r\n"\\]/g, '_');
      const url = await minio.presignedGetObject(bucket, row.storedKey, expirySeconds, {
        'response-content-disposition': `attachment; filename="${safeName}"`,
      });
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
