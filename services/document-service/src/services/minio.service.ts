/**
 * MinIO / S3-compatible object storage helper for document-service.
 *
 * document-service intentionally does NOT depend on the `minio` npm package
 * (unlike storage-service). To avoid adding a dependency, this helper talks to
 * a MinIO/S3 endpoint directly over HTTP using the built-in global `fetch` and
 * AWS Signature V4 request signing (implemented with `node:crypto`).
 *
 * Env names mirror storage-service/src/minio.ts:
 *   MINIO_ENDPOINT / MINIO_PORT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY / MINIO_BUCKET
 *   MINIO_USE_SSL (optional, "true" to use https)
 *   MINIO_REGION  (optional, defaults to "us-east-1")
 *
 * Everything here is GUARDED: `isConfigured()` reports whether the minimal env
 * is present, and every network operation throws on failure so callers can
 * catch and degrade to the previous inline behavior. Nothing here should ever
 * be allowed to block PDF rendering / e-sign.
 */
import { createHash, createHmac } from 'node:crypto';

export interface MinioConfig {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
}

/** Returns the resolved config, or null if the minimal required env is absent. */
export function getMinioConfig(): MinioConfig | null {
  const endpoint = process.env.MINIO_ENDPOINT;
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;
  const bucket = process.env.MINIO_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  const useSSL = process.env.MINIO_USE_SSL === 'true';
  const port = Number(process.env.MINIO_PORT ?? (useSSL ? 443 : 9000));
  return {
    endpoint,
    port,
    useSSL,
    accessKey,
    secretKey,
    bucket,
    region: process.env.MINIO_REGION ?? 'us-east-1',
  };
}

/** True when MinIO env is configured enough to attempt a store. */
export function isMinioConfigured(): boolean {
  return getMinioConfig() !== null;
}

function baseHost(cfg: MinioConfig): string {
  const defaultPort = cfg.useSSL ? 443 : 80;
  return cfg.port === defaultPort ? cfg.endpoint : `${cfg.endpoint}:${cfg.port}`;
}

function objectUrl(cfg: MinioConfig, key: string): string {
  const scheme = cfg.useSSL ? 'https' : 'http';
  return `${scheme}://${baseHost(cfg)}/${cfg.bucket}/${encodeKey(key)}`;
}

/** Encode each path segment but keep the slash separators. */
function encodeKey(key: string): string {
  return key.split('/').map(encodeS3Component).join('/');
}

/** RFC 3986 unreserved-safe encoding used by AWS SigV4 canonical URIs. */
function encodeS3Component(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function amzDate(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function signingKey(cfg: MinioConfig, dateStamp: string): Buffer {
  const kDate = hmac(`AWS4${cfg.secretKey}`, dateStamp);
  const kRegion = hmac(kDate, cfg.region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

/**
 * Upload bytes to `bucket/key`. Throws on any non-2xx response or transport error.
 */
export async function putObject(
  cfg: MinioConfig,
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const now = new Date();
  const { amzDate: amz, dateStamp } = amzDate(now);
  const host = baseHost(cfg);
  const canonicalUri = `/${cfg.bucket}/${encodeKey(key)}`;
  const payloadHash = sha256Hex(body);

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amz}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amz,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signature = createHmac('sha256', signingKey(cfg, dateStamp))
    .update(stringToSign, 'utf8')
    .digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(objectUrl(cfg, key), {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      Host: host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amz,
      Authorization: authorization,
    },
    // Node's fetch (undici) accepts a Uint8Array/Buffer body at runtime; the
    // ambient BodyInit type in this project omits it, so cast narrowly.
    body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength) as unknown as BodyInit,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MinIO PUT ${key} failed: ${res.status} ${text}`.trim());
  }
}

/**
 * Build a presigned GET URL (SigV4 query-string auth) for `bucket/key`.
 * Pure computation — does not perform any network I/O. Throws only on bad input.
 */
export function presignedGetUrl(cfg: MinioConfig, key: string, expirySeconds = 3600): string {
  const expires = Math.min(Math.max(Math.floor(expirySeconds), 1), 604800);
  const now = new Date();
  const { amzDate: amz, dateStamp } = amzDate(now);
  const host = baseHost(cfg);
  const canonicalUri = `/${cfg.bucket}/${encodeKey(key)}`;
  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;

  const query = new URLSearchParams();
  query.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  query.set('X-Amz-Credential', `${cfg.accessKey}/${credentialScope}`);
  query.set('X-Amz-Date', amz);
  query.set('X-Amz-Expires', String(expires));
  query.set('X-Amz-SignedHeaders', 'host');
  // Canonical query string must be sorted; URLSearchParams preserves insertion,
  // so build it sorted explicitly.
  const canonicalQuery = [...query.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeS3Component(k)}=${encodeS3Component(v)}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amz,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signature = createHmac('sha256', signingKey(cfg, dateStamp))
    .update(stringToSign, 'utf8')
    .digest('hex');

  const scheme = cfg.useSSL ? 'https' : 'http';
  return `${scheme}://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
