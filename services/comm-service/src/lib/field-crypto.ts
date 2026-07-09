import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM field encryption — the SAME mechanism integration-service uses
 * (createFieldCrypto) for storing OAuth tokens / secrets at rest. Reused here to
 * encrypt per-user MailAccount SMTP passwords and OAuth tokens.
 *
 * Blob layout: base64url( iv[12] | authTag[16] | ciphertext ).
 *
 * The key is the platform master key (ENCRYPTION_MASTER_KEY). A 32-byte UTF-8
 * key is used verbatim (byte-identical to integration-service); any other length
 * is normalised via SHA-256 so misconfigured key lengths still work safely.
 */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

export type FieldCrypto = {
  encrypt(plain: string): string;
  decrypt(blob: string): string;
};

export function createFieldCrypto(keyUtf8: string): FieldCrypto {
  const raw = Buffer.from(keyUtf8, 'utf8');
  const key = raw.length === 32 ? raw : createHash('sha256').update(keyUtf8).digest();
  return {
    encrypt(plain: string): string {
      const iv = randomBytes(IV_LEN);
      const cipher = createCipheriv(ALGO, key, iv);
      const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([iv, tag, enc]).toString('base64url');
    },
    decrypt(blob: string): string {
      const buf = Buffer.from(blob, 'base64url');
      const iv = buf.subarray(0, IV_LEN);
      const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
      const data = buf.subarray(IV_LEN + TAG_LEN);
      const decipher = createDecipheriv(ALGO, key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    },
  };
}

/**
 * Build the field crypto from the platform master key env. Fails loud if the key
 * is missing / too short — secrets must never be written under a weak key.
 */
export function createFieldCryptoFromEnv(): FieldCrypto {
  const key =
    process.env.ENCRYPTION_MASTER_KEY ??
    process.env.INTEGRATION_ENCRYPTION_KEY ??
    process.env.INTEGRATION_SECRET_KEY;
  if (!key || key.length < 32) {
    throw new Error('ENCRYPTION_MASTER_KEY must be set to at least 32 characters.');
  }
  return createFieldCrypto(key);
}
