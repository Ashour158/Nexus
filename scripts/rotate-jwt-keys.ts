#!/usr/bin/env tsx
/**
 * JWT Key Rotation Script
 * Generates new RSA key pair, promotes current key to previous, and pushes to Redis.
 */
import { randomUUID } from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const KEY_PREFIX = 'jwt_keys';

interface KeyPair {
  id: string;
  publicKey: string;
  privateKey: string;
  createdAt: string;
  expiresAt: string;
}

function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

  return {
    id: randomUUID(),
    publicKey,
    privateKey,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

async function rotateKeys(): Promise<void> {
  console.log('=== JWT Key Rotation ===');

  // Fetch current keys
  const currentJson = await redis.get(`${KEY_PREFIX}:current`);
  const previousJson = await redis.get(`${KEY_PREFIX}:previous`);

  // Promote current → previous, previous → archive
  if (currentJson) {
    await redis.setex(`${KEY_PREFIX}:previous`, 604800, currentJson); // 7 days TTL
    console.log('Current key promoted to previous (7d TTL)');
  }
  if (previousJson) {
    const previous = JSON.parse(previousJson) as KeyPair;
    await redis.setex(`${KEY_PREFIX}:archive:${previous.id}`, 86400, previousJson); // 1 day TTL
    console.log(`Previous key archived: ${previous.id}`);
  }

  // Generate new key
  const newKey = generateKeyPair();
  await redis.set(`${KEY_PREFIX}:current`, JSON.stringify(newKey));
  console.log(`New key generated: ${newKey.id}`);
  console.log(`Expires at: ${newKey.expiresAt}`);

  // Store public key separately for verification
  await redis.set(`${KEY_PREFIX}:public:${newKey.id}`, newKey.publicKey);
  await redis.set(`${KEY_PREFIX}:public:current`, newKey.publicKey);

  // Clean up old public keys (keep current + previous rotation window)
  const publicKeys = await redis.keys(`${KEY_PREFIX}:public:*`);
  const toDelete = publicKeys.filter(
    (k) => k !== `${KEY_PREFIX}:public:current` && k !== `${KEY_PREFIX}:public:previous`
  );
  if (toDelete.length > 0) {
    // Delete in batches to avoid blocking Redis
    const BATCH_SIZE = 100;
    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
      const batch = toDelete.slice(i, i + BATCH_SIZE);
      await redis.del(...batch);
    }
    console.log(`Cleaned up ${toDelete.length} old public keys`);
  }

  console.log('✅ Rotation complete');
  await redis.quit();
}

rotateKeys().catch((err) => {
  console.error('❌ Rotation failed:', err);
  process.exit(1);
});
