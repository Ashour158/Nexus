import type { ClickHouseClient } from '@clickhouse/client';

/**
 * Idempotently ensure the base-currency columns exist on the ClickHouse
 * write-models. This is additive and safe to run on every boot: ClickHouse
 * supports `ADD COLUMN IF NOT EXISTS`, so re-running is a no-op.
 *
 * We store the roll-up-correct amount as `base_amount` (in the tenant base
 * currency) ALONGSIDE the original `amount`/`total`, plus `base_currency` so the
 * read-models remain self-describing. Existing rows get the column default (0 /
 * ''); aggregate queries fall back to the original amount for those rows.
 *
 * GUARANTEE: never throws out of `ensureCurrencyColumns`. A migration failure
 * (e.g. table not yet created, ClickHouse briefly unreachable) must NOT block the
 * service or event ingestion — projections already degrade to 1:1 and can insert
 * once the columns land on a later boot.
 */

/** table -> the "amount-like" columns that get a base_* companion */
const EVENT_TABLES: Array<{ table: string }> = [
  { table: 'deal_events' },
  { table: 'quote_events' },
  { table: 'invoice_events' },
];

const SUMMARY_ALTERS: string[] = [
  // deals_summary: base companions for total_amount + weighted_amount
  `ALTER TABLE deals_summary ADD COLUMN IF NOT EXISTS base_total_amount Decimal64(2) DEFAULT 0`,
  `ALTER TABLE deals_summary ADD COLUMN IF NOT EXISTS base_weighted_amount Decimal64(2) DEFAULT 0`,
  `ALTER TABLE deals_summary ADD COLUMN IF NOT EXISTS base_currency String DEFAULT ''`,
  // quotes_summary: base companion for total
  `ALTER TABLE quotes_summary ADD COLUMN IF NOT EXISTS base_total Decimal64(2) DEFAULT 0`,
  `ALTER TABLE quotes_summary ADD COLUMN IF NOT EXISTS base_currency String DEFAULT ''`,
  // invoices_summary: base companions for total_amount + paid_amount
  `ALTER TABLE invoices_summary ADD COLUMN IF NOT EXISTS base_total_amount Decimal64(2) DEFAULT 0`,
  `ALTER TABLE invoices_summary ADD COLUMN IF NOT EXISTS base_paid_amount Decimal64(2) DEFAULT 0`,
  `ALTER TABLE invoices_summary ADD COLUMN IF NOT EXISTS base_currency String DEFAULT ''`,
];

async function runCommand(client: ClickHouseClient, query: string): Promise<void> {
  // @clickhouse/client exposes `command` for DDL that returns no rows.
  await (client as unknown as { command: (o: { query: string }) => Promise<unknown> }).command({
    query,
  });
}

export async function ensureCurrencyColumns(client: ClickHouseClient): Promise<void> {
  const statements: string[] = [];
  for (const { table } of EVENT_TABLES) {
    statements.push(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS base_amount Decimal64(2) DEFAULT 0`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS base_currency String DEFAULT ''`
    );
  }
  // deal_events gains a per-deal `probability` column (0-100 win probability)
  // so the weighted-pipeline forecast can use the real per-stage probability
  // instead of a flat default. Additive + idempotent; existing rows default to 0
  // and the forecast query falls back to its sane default for those.
  statements.push(
    `ALTER TABLE deal_events ADD COLUMN IF NOT EXISTS probability Float64 DEFAULT 0`
  );

  statements.push(...SUMMARY_ALTERS);

  for (const query of statements) {
    try {
      await runCommand(client, query);
    } catch (err) {
      // Non-fatal: log and continue. A single failing ALTER (e.g. table missing)
      // must not abort the others or the boot sequence.
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          level: 'warn',
          service: 'analytics-service',
          component: 'ddl',
          message: 'ensureCurrencyColumns: statement failed (non-fatal)',
          query,
          error: (err as Error)?.message,
        })
      );
    }
  }
}
