/**
 * Formatting helpers for the CRM UI.
 *
 * Deal amounts arrive over the wire as strings (Prisma Decimal → JSON string)
 * to preserve precision. These helpers coerce safely and format using
 * `Intl.NumberFormat`, which respects currency and locale.
 */

/** Parses a wire-format decimal (`string | number | null | undefined`) to a JS number. */
export function parseDecimal(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Formats a monetary amount using the given ISO-4217 currency code. Falls back
 * to a plain number format if the currency code is invalid.
 */
export function formatCurrency(
  amount: string | number | null | undefined,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  const value = parseDecimal(amount);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(0)}`;
  }
}

/**
 * Formats a count with thousand separators (e.g. `1,234 deals`).
 */
export function formatCount(n: number, label?: string): string {
  const formatted = new Intl.NumberFormat('en-US').format(n);
  return label ? `${formatted} ${label}` : formatted;
}
