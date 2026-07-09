/**
 * Storage service client — uploads base64-encoded files to the internal
 * object-store and returns the storage key. Falls back to a timestamped
 * manual path when no content is provided.
 */

export interface StorageUploadPayload {
  fileName: string;
  mimeType: string;
  contentBase64?: string;
}

export async function uploadToStorage(payload: StorageUploadPayload): Promise<string> {
  if (!payload.contentBase64) {
    return `manual/${Date.now()}-${payload.fileName}`;
  }
  const base = process.env.STORAGE_SERVICE_URL ?? 'http://localhost:3008';
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  const res = await fetch(`${base}/api/v1/objects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error('Storage upload failed');
  }
  const body = (await res.json()) as { data?: { storageKey?: string } };
  return body.data?.storageKey ?? `fallback/${Date.now()}-${payload.fileName}`;
}
