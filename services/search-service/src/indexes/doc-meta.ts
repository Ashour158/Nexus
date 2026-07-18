/**
 * Enriches a Meilisearch document with numeric (epoch-ms) mirrors of its ISO
 * timestamp fields so range filters work.
 *
 * Meilisearch range filters (`>=` / `<=`) only compare numeric values, but
 * domain events carry `createdAt` / `updatedAt` as ISO-8601 strings. We add
 * `createdAtTs` / `updatedAtTs` (parsed epoch ms) alongside the originals so a
 * date-range filter can target the numeric mirror. Idempotent and additive:
 * unparseable / missing timestamps are simply skipped, and the original ISO
 * fields are preserved for sorting/display.
 */
export function addSearchMeta(doc: Record<string, unknown>): Record<string, unknown> {
  const enriched: Record<string, unknown> = { ...doc };
  for (const [field, tsField] of [
    ['createdAt', 'createdAtTs'],
    ['updatedAt', 'updatedAtTs'],
  ] as const) {
    const raw = doc[field];
    if (typeof raw === 'string' || typeof raw === 'number' || raw instanceof Date) {
      const ms = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
      if (Number.isFinite(ms)) enriched[tsField] = ms;
    }
  }
  return enriched;
}
