/**
 * JWT Key Rotation support — fetch current/previous public keys from Redis.
 */
import { createRedisClient } from '@nexus/service-utils';

const redis = createRedisClient();
const KEY_PREFIX = 'jwt_keys';

export interface KeyMetadata {
  id: string;
  publicKey: string;
  createdAt: string;
  expiresAt: string;
}

export async function getCurrentPublicKey(): Promise<string | null> {
  return redis.get(`${KEY_PREFIX}:public:current`);
}

export async function getSigningPrivateKey(): Promise<string | null> {
  const raw = await redis.get(`${KEY_PREFIX}:current`);
  if (!raw) return null;
  const meta = JSON.parse(raw) as KeyMetadata & { privateKey: string };
  return meta.privateKey;
}

export async function getAllPublicKeys(): Promise<Record<string, string>> {
  const keys = await redis.keys(`${KEY_PREFIX}:public:*`);
  const result: Record<string, string> = {};
  for (const key of keys) {
    const keyId = key.replace(`${KEY_PREFIX}:public:`, '');
    // Skip the `current` alias — it points at the active key's public PEM and is
    // not a distinct key id. Including it makes callers treat the active key as a
    // separate (previous) key and re-import its public PEM as a private key.
    if (keyId === 'current') continue;
    const publicKey = await redis.get(key);
    if (publicKey) {
      result[keyId] = publicKey;
    }
  }
  return result;
}

export async function verifyKeyNotExpired(keyId: string): Promise<boolean> {
  const raw = await redis.get(`${KEY_PREFIX}:current`);
  if (!raw) return false;
  const meta = JSON.parse(raw) as KeyMetadata;
  if (meta.id !== keyId) return true; // Previous keys are valid for rotation window
  return new Date(meta.expiresAt) > new Date();
}

export async function storeKeyPair(
  id: string,
  privateKey: string,
  publicKey: string,
  createdAt: string,
  expiresAt: string
): Promise<void> {
  const meta: KeyMetadata & { privateKey: string } = {
    id,
    publicKey,
    createdAt,
    expiresAt,
    privateKey,
  };
  await redis.set(`${KEY_PREFIX}:current`, JSON.stringify(meta));
  await redis.set(`${KEY_PREFIX}:public:${id}`, publicKey);
  await redis.set(`${KEY_PREFIX}:public:current`, publicKey);
}
