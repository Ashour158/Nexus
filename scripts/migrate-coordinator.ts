/**
 * Prisma Migration Coordinator
 *
 * Runs `prisma migrate deploy` across all services in dependency order.
 * Supports --dry-run, --service=xxx, and --rollback=N.
 *
 * Usage:
 *   tsx scripts/migrate-coordinator.ts
 *   tsx scripts/migrate-coordinator.ts --dry-run
 *   tsx scripts/migrate-coordinator.ts --service=auth-service
 *   tsx scripts/migrate-coordinator.ts --rollback=1
 */

import { execSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SERVICES_DIR = join(process.cwd(), 'services');

// Topological order: auth must run before services that depend on auth users/tenants
const DEPENDENCY_ORDER = [
  'auth-service',
  'crm-service',
  'finance-service',
  'comm-service',
  'approval-service',
  'workflow-service',
  'analytics-service',
  'document-service',
  'chatbot-service',
  'cadence-service',
  'territory-service',
  'planning-service',
  'reporting-service',
  'portal-service',
  'knowledge-service',
  'incentive-service',
  'integration-service',
  'blueprint-service',
  'email-sync-service',
  'storage-service',
  'realtime-service',
];

function parseArgs(): { dryRun: boolean; service?: string; rollback?: number } {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    service: args.find((a) => a.startsWith('--service='))?.replace('--service=', ''),
    rollback: args.find((a) => a.startsWith('--rollback='))
      ? Number(args.find((a) => a.startsWith('--rollback='))!.replace('--rollback=', ''))
      : undefined,
  };
}

function discoverServices(): string[] {
  const dirs = readdirSync(SERVICES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  // Sort by dependency order, with unknown services at the end
  const ordered = DEPENDENCY_ORDER.filter((s) => dirs.includes(s));
  const remaining = dirs.filter((s) => !DEPENDENCY_ORDER.includes(s));
  return [...ordered, ...remaining];
}

function hasPrisma(service: string): boolean {
  return existsSync(join(SERVICES_DIR, service, 'prisma', 'schema.prisma'));
}

function runMigrateDeploy(service: string, dryRun: boolean): void {
  const serviceDir = join(SERVICES_DIR, service);
  console.log(`[${service}] Running prisma migrate deploy...`);
  if (dryRun) {
    console.log(`[DRY RUN] Would execute: cd ${serviceDir} && node ../../node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma`);
    return;
  }
  try {
    execSync('node ../../node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma', {
      cwd: serviceDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        // Bypass PgBouncer for migrations (direct mode)
        DATABASE_URL: process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL,
      },
    });
    console.log(`[${service}] ✅ Migration successful`);
  } catch (err) {
    console.error(`[${service}] ❌ Migration failed`);
    throw err;
  }
}

function runRollback(service: string, steps: number, dryRun: boolean): void {
  const serviceDir = join(SERVICES_DIR, service);
  console.log(`[${service}] Rolling back ${steps} migration(s)...`);
  if (dryRun) {
    console.log(`[DRY RUN] Would execute: cd ${serviceDir} && node ../../node_modules/.bin/prisma migrate resolve --rolled-back --schema=prisma/schema.prisma`);
    return;
  }
  try {
    execSync(`node ../../node_modules/.bin/prisma migrate resolve --rolled-back "${steps}" --schema=prisma/schema.prisma`, {
      cwd: serviceDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL,
      },
    });
    console.log(`[${service}] ✅ Rollback successful`);
  } catch (err) {
    console.error(`[${service}] ❌ Rollback failed`);
    throw err;
  }
}

async function main(): Promise<void> {
  const { dryRun, service, rollback } = parseArgs();
  const services = service ? [service] : discoverServices();
  const servicesWithPrisma = services.filter(hasPrisma);

  console.log(`Migration Coordinator — ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Services to migrate: ${servicesWithPrisma.join(', ')}\n`);

  let failed = 0;
  for (const svc of servicesWithPrisma) {
    try {
      if (rollback && rollback > 0) {
        runRollback(svc, rollback, dryRun);
      } else {
        runMigrateDeploy(svc, dryRun);
      }
    } catch {
      failed++;
      if (!dryRun) process.exitCode = 1;
    }
  }

  console.log(`\n${dryRun ? 'Dry run' : 'Migration'} complete. ${failed} failed, ${servicesWithPrisma.length - failed} succeeded.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
