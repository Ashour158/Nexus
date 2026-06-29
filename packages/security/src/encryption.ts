/**
 * Field-Level Encryption — AES-256-GCM for sensitive PII fields.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

export interface EncryptedField {
  ciphertext: string;
  iv: string;
  authTag: string;
  salt: string;
}

function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return scryptSync(masterKey, salt, 32);
}

export function encryptField(fieldName: string, plaintext: string, masterKey: string): EncryptedField {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(masterKey, salt);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64'),
  };
}

export function decryptField(fieldName: string, encrypted: EncryptedField, masterKey: string): string {
  const salt = Buffer.from(encrypted.salt, 'base64');
  const iv = Buffer.from(encrypted.iv, 'base64');
  const authTag = Buffer.from(encrypted.authTag, 'base64');
  const key = deriveKey(masterKey, salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, 'base64')), decipher.final()]);
  return decrypted.toString('utf-8');
}

export interface EncryptedFieldConfig {
  model: string;
  fields: string[];
}

export function withFieldEncryption(
  prisma: { $use: (middleware: (params: Record<string, unknown>, next: (params: Record<string, unknown>) => Promise<unknown>) => Promise<unknown>) => void },
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

    if (['findUnique', 'findFirst', 'findMany'].includes(params.action as string) && result) {
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
