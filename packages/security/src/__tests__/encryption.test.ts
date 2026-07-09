import { describe, it, expect } from 'vitest';
import { encryptField, decryptField } from '../encryption.js';

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
});
