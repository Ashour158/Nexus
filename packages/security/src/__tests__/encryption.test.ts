import { describe, it, expect } from 'vitest';
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { encryptField, decryptField, type EncryptedField } from '../encryption.js';

describe('Field-Level Encryption', () => {
  const masterKey = 'test-master-key-32-bytes-long!!';

  it('encrypts and decrypts a field', () => {
    const original = 'sensitive-data-123';
    const encrypted = encryptField('ssn', original, masterKey);
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.authTag).toBeTruthy();
    expect(encrypted.salt).toBeTruthy();

    const decrypted = decryptField('ssn', encrypted, masterKey);
    expect(decrypted).toBe(original);
  });

  it('produces different ciphertexts for same plaintext', () => {
    const original = 'same-text';
    const e1 = encryptField('field', original, masterKey);
    const e2 = encryptField('field', original, masterKey);
    expect(e1.ciphertext).not.toBe(e2.ciphertext);
  });

  it('marks new ciphertext as v2 (HKDF key derivation)', () => {
    const encrypted = encryptField('field', 'hello', masterKey);
    expect(encrypted.v).toBe(2);
  });

  it('still decrypts legacy v1 blobs (scrypt-derived key, no v marker)', () => {
    // Reproduce the pre-v2 write path exactly: scrypt(masterKey, salt, 32).
    const original = 'legacy-pii-value';
    const salt = randomBytes(32);
    const iv = randomBytes(16);
    const key = scryptSync(masterKey, salt, 32);
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    const ciphertext = Buffer.concat([cipher.update(original, 'utf-8'), cipher.final()]);
    const legacy: EncryptedField = {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      salt: salt.toString('base64'),
    };
    expect(decryptField('field', legacy, masterKey)).toBe(original);
    // Second decrypt exercises the derived-key cache path.
    expect(decryptField('field', legacy, masterKey)).toBe(original);
  });
});
