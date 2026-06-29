/**
 * ClickHouse Migration Runner
 *
 * Reads `infrastructure/clickhouse/migrations/*.sql` and runs them in order,
 * tracking applied migrations in a `schema_migrations` table.
 *
 * Usage:
 *   tsx scripts/migrate-clickhouse.ts
 *   tsx scripts/migrate-clickhouse.ts --dry-run
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'infrastructure', 'clickhouse', 'migrations');
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL ?? 'http://localhost:8123';
const CLICKHOUSE_DB = process.env.CLICKHOUSE_DB ?? 'nexus_analytics';

interface MigrationRow {
  version: string;
  applied_at: string;
}

async function query<T>(sql: string): Promise<T[]> {
  const url = new URL(CLICKHOUSE_URL);
  url.searchParams.set('query', sql);
  const res = await fetch(url.toString(), { method: 'POST' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickHouse query failed: ${res.status} ${text}`);
  }
  const text = await res.text();
  if (!text.trim()) return [];
  // Parse TSV format
  return text.trim().split('\n').map((line) => {
    const cols = line.split('\t');
    return cols as unknown as T;
  });
}

async function exec(sql: string): Promise<void> {
  const url = new URL(CLICKHOUSE_URL);
  url.searchParams.set('query', sql);
  const res = await fetch(url.toString(), { method: 'POST' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickHouse exec failed: ${res.status} ${text}`);
  }
}

async function ensureMigrationsTable(): Promise<void> {
  await exec(`
    CREATE TABLE IF NOT EXISTS ${CLICKHOUSE_DB}.schema_migrations
    (
      version String,
      applied_at DateTime DEFAULT now()
    )
    ENGINE = MergeTree()
    ORDER BY version
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const rows = await query<MigrationRow>(`
    SELECT version, applied_at FROM ${CLICKHOUSE_DB}.schema_migrations ORDER BY version
  `);
  return new Set(rows.map((r) => r.version));
}

function discoverMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  const migrations = discoverMigrations();

  console.log(`ClickHouse Migration Runner — ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Database: ${CLICKHOUSE_DB}`);
  console.log(`Applied: ${applied.size}, Pending: ${migrations.length - applied.size}\n`);

  for (const file of migrations) {
    if (applied.has(file)) {
      console.log(`[SKIP] ${file}`);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    console.log(`[RUN] ${file}`);
    if (dryRun) {
      console.log(`[DRY RUN] Would execute ${sql.length} chars`);
      continue;
    }
    try {
      await exec(sql);
      await exec(`INSERT INTO ${CLICKHOUSE_DB}.schema_migrations (version) VALUES ('${file}')`);
      console.log(`[OK] ${file}`);
    } catch (err) {
      console.error(`[FAIL] ${file}:`, err);
      process.exit(1);
    }
  }

  console.log('\nMigrations complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
