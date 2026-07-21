// One-time maintenance: encrypt pre-existing PLAINTEXT contact/lead names.
// firstName/lastName were added to crm-service's field-encryption config
// (audit: "plaintext CRM contact names"); new writes encrypt automatically,
// this backfills rows written before the change.
//
// Run INSIDE the crm-service container (it has the generated Prisma client):
//   docker compose cp scripts/encrypt-crm-names-backfill.mjs crm-service:/tmp/
//   docker compose exec -T crm-service node /tmp/encrypt-crm-names-backfill.mjs
//
// Idempotent: values already carrying the encryption JSON envelope are
// skipped. Uses raw SQL so the field-encryption Prisma middleware cannot
// double-encrypt.

import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { PrismaClient } from '/app/node_modules/.prisma/crm-client/index.js';

const MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY;
if (!MASTER_KEY || MASTER_KEY.length < 32) {
  console.error('ENCRYPTION_MASTER_KEY missing/short — nothing to do');
  process.exit(1);
}
const HKDF_INFO = 'nexus-field-encryption-v2';

const TARGETS = [
  { table: 'Contact', cols: ['firstName', 'lastName'] },
  { table: 'Lead', cols: ['firstName', 'lastName'] },
];

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

const dbUrl = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('No CRM_DATABASE_URL / DATABASE_URL in env');
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
let rewritten = 0, skipped = 0;

for (const { table, cols } of TARGETS) {
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const rows = await prisma.$queryRawUnsafe(`SELECT id, ${colList} FROM "${table}"`);
  for (const row of rows) {
    const sets = [];
    const vals = [];
    for (const col of cols) {
      const val = row[col];
      // Already-encrypted values are the JSON envelope; plaintext names are not.
      if (typeof val !== 'string' || val.length === 0 || val.startsWith('{"ciphertext"')) {
        skipped++;
        continue;
      }
      vals.push(encryptV2(val));
      sets.push(`"${col}" = $${vals.length}`);
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

console.log(JSON.stringify({ rewritten, skipped }));
await prisma.$disconnect();
