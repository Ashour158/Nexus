/**
 * Zero-dependency cron / interval helper for the scheduled-data-job poller.
 *
 * `cron-parser` is NOT a dependency of this service, so rather than add one we
 * implement the common subset of the standard 5-field cron spec plus the usual
 * `@macro` shortcuts. This is enough to express the daily / hourly / weekly
 * cadences the data-job scheduler needs (and considerably more):
 *
 *   ┌─ minute (0-59)
 *   │ ┌─ hour (0-23)
 *   │ │ ┌─ day-of-month (1-31)
 *   │ │ │ ┌─ month (1-12)
 *   │ │ │ │ ┌─ day-of-week (0-6, Sunday = 0; 7 also accepted as Sunday)
 *   * * * * *
 *
 * Each field supports `*`, lists (`1,15`), ranges (`1-5`), and steps
 * (`* /15`, `1-5/2`). Macros: `@hourly @daily @midnight @weekly @monthly
 * `@yearly @annually`, and the bare words `hourly|daily|weekly|monthly` for
 * friendliness. `@every <n><s|m|h|d>` gives a fixed interval from `from`.
 *
 * All computation is in UTC so a job fires at the same absolute instant
 * regardless of the host timezone.
 */

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
  yearly: '0 0 1 1 *',
  annually: '0 0 1 1 *',
  monthly: '0 0 1 * *',
  weekly: '0 0 * * 0',
  daily: '0 0 * * *',
  hourly: '0 * * * *',
};

interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

/** Expand a single cron field (e.g. `1-5/2`, `* /15`, `1,15`) into a Set. */
function parseField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    let range = part;
    let step = 1;
    const slash = part.indexOf('/');
    if (slash !== -1) {
      range = part.slice(0, slash);
      step = parseInt(part.slice(slash + 1), 10);
      if (!Number.isFinite(step) || step <= 0) step = 1;
    }

    let lo = min;
    let hi = max;
    if (range !== '*') {
      const dash = range.indexOf('-');
      if (dash !== -1) {
        lo = parseInt(range.slice(0, dash), 10);
        hi = parseInt(range.slice(dash + 1), 10);
      } else {
        lo = parseInt(range, 10);
        hi = lo;
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    if (lo < min) lo = min;
    if (hi > max) hi = max;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** Parse a 5-field cron string (after macro expansion) into matcher sets. */
function parseCron(expr: string): CronFields | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h, dom, mon, dow] = parts;
  const fields: CronFields = {
    minute: parseField(m, 0, 59),
    hour: parseField(h, 0, 23),
    dom: parseField(dom, 1, 31),
    month: parseField(mon, 1, 12),
    // Normalise Sunday: cron allows 7 as well as 0.
    dow: new Set(Array.from(parseField(dow, 0, 7)).map((d) => (d === 7 ? 0 : d))),
    domRestricted: dom.trim() !== '*',
    dowRestricted: dow.trim() !== '*',
  };
  if (
    fields.minute.size === 0 ||
    fields.hour.size === 0 ||
    fields.dom.size === 0 ||
    fields.month.size === 0 ||
    fields.dow.size === 0
  ) {
    return null;
  }
  return fields;
}

/** Standard cron day-matching: if BOTH dom and dow are restricted, either matches. */
function dayMatches(fields: CronFields, date: Date): boolean {
  const domOk = fields.dom.has(date.getUTCDate());
  const dowOk = fields.dow.has(date.getUTCDay());
  if (fields.domRestricted && fields.dowRestricted) return domOk || dowOk;
  if (fields.domRestricted) return domOk;
  if (fields.dowRestricted) return dowOk;
  return true;
}

/** Parse `@every <n><unit>` into milliseconds, or null if not that form. */
function parseEvery(expr: string): number | null {
  const match = /^@every\s+(\d+)\s*([smhd])$/i.exec(expr.trim());
  if (!match) return null;
  const n = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}

/**
 * Compute the next fire time strictly AFTER `from` for a cron expression.
 *
 * Fail-safe: an unparseable or never-matching expression returns `from + 1 day`
 * so a bad schedule can never wedge the poller or hot-loop it.
 */
export function computeNextRun(cronExpr: string, from: Date = new Date()): Date {
  const raw = (cronExpr ?? '').trim();

  const everyMs = parseEvery(raw);
  if (everyMs !== null) return new Date(from.getTime() + everyMs);

  const expanded = MACROS[raw.toLowerCase()] ?? raw;
  const fields = parseCron(expanded);
  if (!fields) {
    const fallback = new Date(from);
    fallback.setUTCDate(fallback.getUTCDate() + 1);
    return fallback;
  }

  // Start at the next whole minute after `from` and scan forward minute by
  // minute. Cap at ~366 days so even a `0 0 29 2 *` (Feb 29) always terminates.
  const cursor = new Date(from);
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  const maxMinutes = 366 * 24 * 60;
  for (let i = 0; i < maxMinutes; i++) {
    if (
      fields.month.has(cursor.getUTCMonth() + 1) &&
      dayMatches(fields, cursor) &&
      fields.hour.has(cursor.getUTCHours()) &&
      fields.minute.has(cursor.getUTCMinutes())
    ) {
      return new Date(cursor);
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }

  const fallback = new Date(from);
  fallback.setUTCDate(fallback.getUTCDate() + 1);
  return fallback;
}
