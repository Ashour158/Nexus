import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

export function createFieldCrypto(keyUtf8: string) {
  const key = Buffer.from(keyUtf8, 'utf8');
  if (key.length !== 32) {
    throw new Error('INTEGRATION_SECRET_KEY must be exactly 32 UTF-8 bytes.');
  }
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

export function signWebhookBody(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}
