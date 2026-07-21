// One-time maintenance: re-encrypt auth-service PII from legacy v1 field
// encryption (scrypt-derived key per field — ~80ms of BLOCKED event loop per
// decrypt) to v2 (HKDF-SHA256, microseconds). After this runs, no read path in
// auth-service ever touches scrypt again.
//
// Run INSIDE the auth-service container (it has the generated Prisma client):
//   docker compose exec -T auth-service node /tmp/reencrypt-auth-pii-v2.mjs
//
// Idempotent: rows already carrying `"v":2` are skipped. Any value that fails
// to parse/decrypt is left untouched and reported. Uses raw SQL so the
// field-encryption Prisma middleware cannot double-encrypt.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, scryptSync } from 'node:crypto';
import { PrismaClient } from '/app/node_modules/.prisma/auth-client/index.js';

const MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY;
if (!MASTER_KEY || MASTER_KEY.length < 32) {
  console.error('ENCRYPTION_MASTER_KEY missing/short — nothing to do');
  process.exit(1);
}
const HKDF_INFO = 'nexus-field-encryption-v2';

// table -> { idColumn, encrypted columns }
const TARGETS = [
  { table: 'User', cols: ['firstName', 'lastName', 'phone'] },
  { table: 'UserProfile', cols: ['personalEmail', 'emergencyPhone', 'address', 'dateOfBirth'] },
  { table: 'SsoConfiguration', cols: ['certificate'] },
  { table: 'MfaConfiguration', cols: ['secret'] },
];

function decryptV1(blob) {
  const salt = Buffer.from(blob.salt, 'base64');
  const key = scryptSync(MASTER_KEY, salt, 32);
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'), { authTagLength: 16 });
  d.setAuthTag(Buffer.from(blob.authTag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(blob.ciphertext, 'base64')), d.final()]).toString('utf-8');
}

function encryptV2(plaintext) {
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const key = Buffer.from(hkdfSync('sha256', MASTER_KEY, salt, HKDF_INFO, 32));
  const c = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const ct = Buffer.concat([c.update(plaintext, 'utf-8'), c.final()]);
  return JSON.stringify({
    ciphertext: ct.toString('base64'),
    iv: iv.toString('base64'),
    authTag: c.getAuthTag().toString('base64'),
    salt: salt.toString('base64'),
    v: 2,
  });
}

const prisma = new PrismaClient();
let rewritten = 0, skipped = 0, failed = 0;

for (const { table, cols } of TARGETS) {
  const colList = cols.map((c) => `"${c}"`).join(', ');
  let rows;
  try {
    rows = await prisma.$queryRawUnsafe(`SELECT id, ${colList} FROM "${table}"`);
  } catch (err) {
    console.warn(`skip table ${table}: ${err.message?.split('\n')[0]}`);
    continue;
  }
  for (const row of rows) {
    const sets = [];
    const vals = [];
    for (const col of cols) {
      const val = row[col];
      if (typeof val !== 'string' || !val.startsWith('{')) { skipped++; continue; }
      let blob;
      try { blob = JSON.parse(val); } catch { skipped++; continue; }
      if (!blob || typeof blob !== 'object' || !blob.ciphertext || !blob.salt) { skipped++; continue; }
      if (blob.v === 2) { skipped++; continue; }
      try {
        const plaintext = decryptV1(blob);
        vals.push(encryptV2(plaintext));
        sets.push(`"${col}" = $${vals.length}`);
      } catch (err) {
        failed++;
        console.warn(`FAILED ${table}.${col} id=${row.id}: ${err.message}`);
      }
    }
    if (sets.length > 0) {
      vals.push(row.id);
      await prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET ${sets.join(', ')} WHERE id = $${vals.length}`,
        ...vals
      );
      rewritten += sets.length;
    }
  }
  console.log(`${table}: done`);
}

console.log(JSON.stringify({ rewritten, skipped, failed }));
await prisma.$disconnect();
process.exit(failed > 0 ? 2 : 0);
