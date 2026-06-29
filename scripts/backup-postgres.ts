#!/usr/bin/env tsx
/**
 * Postgres Backup Script
 * Runs an incremental pgBackRest backup, checks freshness, then verifies.
 */
import { execSync } from 'node:child_process';

const STANZA = process.env.PGBACKREST_STANZA ?? 'nexus';
const MAX_AGE_HOURS = 25;

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', env: process.env });
}

console.log('=== Nexus CRM Postgres Backup ===');

// Step 1: Run incremental backup
console.log('Running incremental backup...');
try {
  const backupOut = run(`pgbackrest --stanza=${STANZA} --type=incr backup`);
  console.log(backupOut);
} catch (err) {
  console.error('❌ Incremental backup failed:', (err as Error).message);
  process.exit(1);
}

// Step 2: Check that the latest backup is recent enough
console.log('Checking backup freshness...');
try {
  const infoJson = run(`pgbackrest --stanza=${STANZA} info --output=json`);
  const stanzas: Array<{ backup?: Array<{ timestamp: { stop: number } }> }> = JSON.parse(infoJson);
  const backups = stanzas[0]?.backup ?? [];
  if (backups.length === 0) {
    console.error('❌ No backups found for stanza');
    process.exit(1);
  }
  const latestStopEpoch = backups[backups.length - 1]?.timestamp.stop ?? 0;
  const ageHours = (Date.now() / 1000 - latestStopEpoch) / 3600;
  if (ageHours > MAX_AGE_HOURS) {
    console.error(`❌ Latest backup is ${ageHours.toFixed(1)}h old — exceeds ${MAX_AGE_HOURS}h threshold`);
    process.exit(1);
  }
  console.log(`✅ Latest backup age: ${ageHours.toFixed(1)}h (within ${MAX_AGE_HOURS}h threshold)`);
} catch (err) {
  console.error('❌ Backup freshness check failed:', (err as Error).message);
  process.exit(1);
}

// Step 3: Verify backup integrity
console.log('Verifying backup integrity...');
try {
  const verifyOut = run(`pgbackrest --stanza=${STANZA} verify`);
  console.log(verifyOut);
  console.log('✅ Backup verification passed');
} catch (err) {
  console.error('❌ Backup verification failed:', (err as Error).message);
  process.exit(1);
}
