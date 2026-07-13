/**
 * Business-hours calculator — the single implementation used for every SLA
 * due-date computation in this service. Given a start instant and a duration in
 * minutes, it returns the instant that duration lands on, either:
 *   - as plain wall-clock time (`businessHoursOnly: false`), or
 *   - counting only minutes that fall inside the configured business window
 *     (`businessHoursOnly: true`), skipping nights and non-business days.
 *
 * All arithmetic is done in UTC. The default window (Mon–Fri, 09:00–17:00 UTC)
 * is overridable via env so an operator can match their support region without
 * a code change:
 *   SLA_BUSINESS_START_HOUR  (0–23, default 9)
 *   SLA_BUSINESS_END_HOUR    (1–24, default 17, must be > start)
 *   SLA_BUSINESS_DAYS        CSV of UTC weekday numbers, 0=Sun..6=Sat
 *                            (default "1,2,3,4,5" = Mon–Fri)
 */

export interface BusinessHoursConfig {
  /** Whole-hour UTC start of the business day, 0–23. */
  startHour: number;
  /** Whole-hour UTC end of the business day, 1–24 (exclusive). */
  endHour: number;
  /** UTC weekday numbers that are business days (0=Sun … 6=Sat). */
  businessDays: ReadonlySet<number>;
}

const MINUTE_MS = 60_000;

let cached: BusinessHoursConfig | null = null;

/** Resolve (and memoize) the business-hours window from env, with safe defaults. */
export function getBusinessHoursConfig(): BusinessHoursConfig {
  if (cached) return cached;
  const startHour = clampInt(process.env.SLA_BUSINESS_START_HOUR, 9, 0, 23);
  let endHour = clampInt(process.env.SLA_BUSINESS_END_HOUR, 17, 1, 24);
  if (endHour <= startHour) endHour = Math.min(24, startHour + 1);

  const daysRaw = (process.env.SLA_BUSINESS_DAYS ?? '1,2,3,4,5')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  const businessDays = new Set<number>(daysRaw.length > 0 ? daysRaw : [1, 2, 3, 4, 5]);

  cached = { startHour, endHour, businessDays };
  return cached;
}

/** Test/hot-reload seam: drop the memoized config so env is re-read. */
export function resetBusinessHoursConfigCache(): void {
  cached = null;
}

function clampInt(raw: string | undefined, dflt: number, min: number, max: number): number {
  const n = raw === undefined ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function isBusinessDay(d: Date, cfg: BusinessHoursConfig): boolean {
  return cfg.businessDays.has(d.getUTCDay());
}

/** Start-of-business-day instant for the calendar day containing `d` (UTC). */
function windowStart(d: Date, cfg: BusinessHoursConfig): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), cfg.startHour, 0, 0, 0)
  );
}

/** End-of-business-day instant for the calendar day containing `d` (UTC). */
function windowEnd(d: Date, cfg: BusinessHoursConfig): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), cfg.endHour, 0, 0, 0)
  );
}

/** Advance `d` to the next business-day start (used when we run off the end of a day). */
function nextBusinessDayStart(d: Date, cfg: BusinessHoursConfig): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + 1);
  let start = windowStart(next, cfg);
  // Skip weekends / non-business days.
  let guard = 0;
  while (!isBusinessDay(start, cfg) && guard++ < 14) {
    start.setUTCDate(start.getUTCDate() + 1);
    start = windowStart(start, cfg);
  }
  return start;
}

/**
 * Add `minutes` of business time to `start`, counting only minutes inside the
 * business window. If `start` is outside the window (evening/weekend), the clock
 * begins at the next window open.
 */
export function addBusinessMinutes(start: Date, minutes: number, cfg: BusinessHoursConfig): Date {
  let remainingMs = Math.max(0, minutes) * MINUTE_MS;
  let cursor = new Date(start.getTime());

  // Roll the cursor forward to the first instant that is inside a business window.
  const align = (): void => {
    let guard = 0;
    while (guard++ < 400) {
      if (!isBusinessDay(cursor, cfg)) {
        cursor = windowStart(cursor, cfg); // normalize before jumping to next day
        cursor = nextBusinessDayStart(cursor, cfg);
        continue;
      }
      const open = windowStart(cursor, cfg);
      const close = windowEnd(cursor, cfg);
      if (cursor.getTime() < open.getTime()) {
        cursor = open;
        return;
      }
      if (cursor.getTime() >= close.getTime()) {
        cursor = nextBusinessDayStart(cursor, cfg);
        continue;
      }
      return; // inside the window
    }
  };

  align();
  let guard = 0;
  while (remainingMs > 0 && guard++ < 2000) {
    const close = windowEnd(cursor, cfg);
    const msLeftToday = close.getTime() - cursor.getTime();
    if (remainingMs <= msLeftToday) {
      return new Date(cursor.getTime() + remainingMs);
    }
    remainingMs -= msLeftToday;
    cursor = nextBusinessDayStart(cursor, cfg);
  }
  return cursor;
}

/**
 * Compute a due date `minutes` after `start`. When `businessHoursOnly` is true
 * the duration is measured in business time; otherwise it is plain wall-clock.
 */
export function computeDueDate(
  start: Date,
  minutes: number,
  businessHoursOnly: boolean,
  cfg: BusinessHoursConfig = getBusinessHoursConfig()
): Date {
  if (!businessHoursOnly) return new Date(start.getTime() + minutes * MINUTE_MS);
  return addBusinessMinutes(start, minutes, cfg);
}
