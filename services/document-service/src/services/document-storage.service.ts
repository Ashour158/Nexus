/**
 * Persists rendered/e-signed PDF bytes to MinIO and records the storageKey on
 * Document + DocumentVersion. Fully GUARDED: any misconfiguration or failure is
 * swallowed (logged by the caller) and reported via the return value, so PDF
 * rendering / e-sign never breaks when object storage is unavailable.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { getMinioConfig, isMinioConfigured, putObject, presignedGetUrl } from './minio.service.js';

/**
 * Minimal structural type for the (tenant-extended) Prisma client this service
 * needs. Kept local so we don't couple to the generated client's exact shape.
 */
export interface DocumentStoragePrisma {
  document: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string; storageKey: string }>;
  };
  documentVersion: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

export interface StorePdfInput {
  tenantId: string;
  ownerId: string;
  name: string;
  mimeType?: string;
  bytes: Buffer;
}

export interface StorePdfResult {
  stored: boolean;
  documentId?: string;
  storageKey?: string;
}

/**
 * Store PDF bytes in MinIO under `tenantId/documents/<uuid>.pdf` and record the
 * key on Document + an initial DocumentVersion. Returns { stored:false } (never
 * throws) when MinIO is unconfigured or any step fails.
 */
export async function storePdf(
  prisma: DocumentStoragePrisma,
  log: FastifyBaseLogger,
  input: StorePdfInput
): Promise<StorePdfResult> {
  const cfg = getMinioConfig();
  if (!cfg) {
    log.warn('MinIO not configured (MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET); returning PDF inline without persistence');
    return { stored: false };
  }

  const mimeType = input.mimeType ?? 'application/pdf';
  const storageKey = `${input.tenantId}/documents/${randomUUID()}.pdf`;

  try {
    await putObject(cfg, storageKey, input.bytes, mimeType);
  } catch (err) {
    log.warn({ err, storageKey }, 'MinIO upload failed; returning PDF inline without persistence');
    return { stored: false };
  }

  try {
    const doc = await prisma.document.create({
      data: {
        tenantId: input.tenantId,
        ownerId: input.ownerId,
        name: input.name,
        mimeType,
        sizeBytes: input.bytes.length,
        storageKey,
      },
    });
    await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        versionNumber: 1,
        storageKey,
        sizeBytes: input.bytes.length,
        createdById: input.ownerId,
      },
    });
    return { stored: true, documentId: doc.id, storageKey };
  } catch (err) {
    // Bytes are safely in MinIO but DB write failed. Do not block the response.
    log.warn({ err, storageKey }, 'Persisted PDF to MinIO but failed to record Document row');
    return { stored: true, storageKey };
  }
}

/**
 * Build a presigned GET URL for a stored key. Returns null (never throws) when
 * MinIO is unconfigured or presign fails.
 */
export function downloadUrlForKey(
  log: FastifyBaseLogger,
  storageKey: string,
  expirySeconds = 3600
): { url: string; expiresAt: string } | null {
  if (!isMinioConfigured()) return null;
  const cfg = getMinioConfig();
  if (!cfg) return null;
  try {
    const url = presignedGetUrl(cfg, storageKey, expirySeconds);
    return { url, expiresAt: new Date(Date.now() + expirySeconds * 1000).toISOString() };
  } catch (err) {
    log.warn({ err, storageKey }, 'Failed to build presigned download URL');
    return null;
  }
}
