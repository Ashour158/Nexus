/**
 * Normalise a timestamp for a ClickHouse `DateTime64(3)` column.
 *
 * Event timestamps arrive as ISO-8601 (`2026-07-15T14:39:08.532Z`), but
 * ClickHouse's JSONEachRow parser REJECTS the `T` separator and `Z` suffix for
 * DateTime64 — it wants `YYYY-MM-DD HH:MM:SS.mmm`. Inserting the raw ISO string
 * fails every row with CANNOT_PARSE_INPUT_ASSERTION_FAILED. Because the consumer
 * retries then drops the event (while the Kafka offset still advances), this
 * silently starved the entire analytics read model: offsets at the log end, zero
 * rows in every table.
 *
 * An unparseable or missing value falls back to "now" rather than dropping the
 * row — a bad clock upstream should never cost us the event.
 */
export function chDateTime(value: unknown): string {
  const parsed =
    value instanceof Date
      ? value
      : typeof value === 'string' || typeof value === 'number'
        ? new Date(value)
        : new Date();
  const d = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return d.toISOString().replace('T', ' ').replace('Z', '');
}
