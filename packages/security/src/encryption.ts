/**
 * Field-Level Encryption — AES-256-GCM for sensitive PII fields.
 */

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const HKDF_INFO = 'nexus-field-encryption-v2';

export interface EncryptedField {
  ciphertext: string;
  iv: string;
  authTag: string;
  salt: string;
  /**
   * KDF version. Absent/undefined = legacy scrypt-derived key (v1);
   * 2 = HKDF-SHA256. New writes always emit v2 — scrypt's cost is pointless
   * here (the master key is high-entropy, not a password) and, being
   * synchronous, it blocked the event loop for ~80ms PER FIELD on reads,
   * which serialized whole list endpoints into tens of seconds.
   */
  v?: 2;
}

/**
 * Cache for LEGACY (v1) scrypt-derived keys, keyed by the per-record salt.
 * Every v1 read used to pay a blocking ~80ms scryptSync; with the cache each
 * distinct salt pays it once per process. Bounded FIFO so it cannot grow
 * unboundedly. (Not keyed by masterKey: a process only ever holds one, and a
 * wrong cached key is caught by the GCM auth tag, never silently accepted.)
 */
const legacyKeyCache = new Map<string, Buffer>();
const LEGACY_KEY_CACHE_MAX = 10_000;

function deriveLegacyKey(masterKey: string, saltB64: string): Buffer {
  const cached = legacyKeyCache.get(saltB64);
  if (cached) return cached;
  const key = scryptSync(masterKey, Buffer.from(saltB64, 'base64'), 32);
  if (legacyKeyCache.size >= LEGACY_KEY_CACHE_MAX) {
    const oldest = legacyKeyCache.keys().next().value;
    if (oldest !== undefined) legacyKeyCache.delete(oldest);
  }
  legacyKeyCache.set(saltB64, key);
  return key;
}

/** v2 key derivation: HKDF-SHA256 — microseconds, safe on the request path. */
function deriveKeyV2(masterKey: string, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey, salt, HKDF_INFO, 32));
}

export function encryptField(fieldName: string, plaintext: string, masterKey: string): EncryptedField {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKeyV2(masterKey, salt);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64'),
    v: 2,
  };
}

export function decryptField(fieldName: string, encrypted: EncryptedField, masterKey: string): string {
  const salt = Buffer.from(encrypted.salt, 'base64');
  const iv = Buffer.from(encrypted.iv, 'base64');
  const authTag = Buffer.from(encrypted.authTag, 'base64');
  const key = encrypted.v === 2 ? deriveKeyV2(masterKey, salt) : deriveLegacyKey(masterKey, encrypted.salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, 'base64')), decipher.final()]);
  return decrypted.toString('utf-8');
}

/**
 * Deterministic keyed **blind index** for an encrypted/PII value.
 *
 * Field encryption is randomized (fresh salt + IV per write), so ciphertext can
 * never be used for equality lookups or a DB unique constraint. A blind index is
 * a deterministic keyed HMAC of the *normalized* plaintext — equal inputs always
 * hash to the same digest — so it can back both application-level dedup
 * (`findFirst({ where: { emailHash } })`) and a DB `@@unique([tenantId, emailHash])`
 * while the plaintext itself stays encrypted at rest.
 *
 * Normalization: trimmed + lowercased, so `" Foo@Bar.com "` and `"foo@bar.com"`
 * collide as intended for email dedup.
 *
 * Key precedence: explicit `key` arg → `BLIND_INDEX_KEY` → `ENCRYPTION_MASTER_KEY`
 * → a fixed dev fallback. The fallback keeps dedup deterministic even when
 * encryption is OFF (no master key configured); it carries no confidentiality
 * value, but in that mode nothing is encrypted anyway.
 */
export function computeBlindIndex(value: string, key?: string): string {
  const k =
    key ??
    process.env.BLIND_INDEX_KEY ??
    process.env.ENCRYPTION_MASTER_KEY ??
    'nexus-blind-index-default-key';
  return createHmac('sha256', k).update(value.trim().toLowerCase()).digest('hex');
}

export interface EncryptedFieldConfig {
  model: string;
  fields: string[];
}

export function withFieldEncryption(
  // `any` here deliberately: each service generates its own PrismaClient with a
  // distinct MiddlewareParams union (one member per that service's models), so
  // there is no single structural type this helper could declare that every
  // generated client's $use would satisfy. The body only reads .model/.action/
  // .args off params, which it already casts internally.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: { $use: (middleware: (params: any, next: (params: any) => Promise<unknown>) => Promise<unknown>) => void },
  masterKey: string,
  configs: EncryptedFieldConfig[]
): void {
  const configMap = new Map(configs.map((c) => [c.model, new Set(c.fields)]));

  prisma.$use(async (params, next) => {
    const fields = configMap.get(params.model as string);
    if (!fields) return next(params);

    if (['create', 'createMany', 'update', 'updateMany', 'upsert'].includes(params.action as string)) {
      const data = (params.args as Record<string, unknown>)?.data;
      if (data) {
        if (Array.isArray(data)) {
          for (const item of data) {
            for (const field of fields) {
              if (typeof item[field] === 'string') {
                item[field] = JSON.stringify(encryptField(field, item[field], masterKey));
              }
            }
          }
        } else {
          const record = data as Record<string, unknown>;
          for (const field of fields) {
            if (typeof record[field] === 'string') {
              record[field] = JSON.stringify(encryptField(field, record[field] as string, masterKey));
            }
          }
        }
      }
    }

    const result = await next(params);

    // Decrypt on reads AND on write return values (create/update/upsert). Without
    // decrypting writes, the record returned to the API — and any Kafka/outbox
    // event built from it — would carry ciphertext instead of plaintext PII.
    // `createMany`/`updateMany` return a `{ count }` batch payload with no
    // record fields, so they are intentionally excluded (nothing to decrypt).
    if (
      ['findUnique', 'findFirst', 'findMany', 'create', 'update', 'upsert'].includes(
        params.action as string
      ) &&
      result
    ) {
      const decrypt = (record: Record<string, unknown>) => {
        for (const field of fields) {
          const val = record[field];
          if (typeof val === 'string') {
            try {
              const parsed = JSON.parse(val) as EncryptedField;
              record[field] = decryptField(field, parsed, masterKey);
            } catch {
              // Not encrypted, leave as-is
            }
          }
        }
      };

      if (Array.isArray(result)) {
        result.forEach(decrypt);
      } else {
        decrypt(result as Record<string, unknown>);
      }
    }

    return result;
  });
}
