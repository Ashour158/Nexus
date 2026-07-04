/**
 * Zero-dependency CSV parser / serializer built on Node built-ins.
 *
 * Replaces the previous `csv-parse` / `csv-stringify` usage. Implements the
 * common subset of RFC 4180: quoted fields, embedded commas, embedded
 * newlines, and escaped quotes (`""`). Designed to be fail-soft — malformed
 * input yields best-effort rows rather than throwing.
 */

/**
 * Parse CSV text into an array of records keyed by the header row.
 *
 * - Handles quoted fields containing commas, CR/LF, and doubled quotes.
 * - Trims surrounding whitespace on unquoted values.
 * - Skips fully empty lines.
 *
 * @param input CSV text (already decoded from the source buffer).
 * @returns `{ headers, rows }` where each row is `Record<header, value>`.
 */
export function parseCsv(input: string): {
  headers: string[];
  rows: Array<Record<string, string>>;
} {
  const records = parseCsvRows(input);
  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < records.length; i++) {
    const cells = records[i];
    // Skip rows that are entirely empty (e.g. trailing blank line).
    if (cells.length === 1 && cells[0].trim() === '') continue;
    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = (cells[c] ?? '').trim();
    }
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Tokenize CSV text into a 2D array of raw cell strings. Exported mainly for
 * unit testing; most callers should use {@link parseCsv}.
 */
export function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const len = input.length;

  // Strip a UTF-8 BOM if present.
  if (len > 0 && input.charCodeAt(0) === 0xfeff) {
    i = 1;
  }

  const pushField = (): void => {
    row.push(field);
    field = '';
  };
  const pushRow = (): void => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (; i < len; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++; // consume the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      pushField();
    } else if (char === '\n') {
      pushRow();
    } else if (char === '\r') {
      // Handle CRLF and lone CR as a single line break.
      if (input[i + 1] === '\n') i++;
      pushRow();
    } else {
      field += char;
    }
  }

  // Flush any trailing field/row that wasn't terminated by a newline.
  if (field !== '' || row.length > 0 || inQuotes) {
    pushRow();
  }

  return rows;
}

/**
 * Escape a single CSV cell value. Wraps in double quotes and doubles any
 * embedded quotes when the value contains a comma, quote, or line break.
 */
export function escapeCsvValue(value: unknown): string {
  const str =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);

  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serialize an array of records to CSV text with a header row.
 *
 * @param records Row objects to serialize.
 * @param columns Column order / selection. If omitted, the union of keys
 *   across all records (in first-seen order) is used.
 */
export function serializeCsv(
  records: Array<Record<string, unknown>>,
  columns?: string[]
): string {
  let cols = columns;
  if (!cols || cols.length === 0) {
    const seen = new Set<string>();
    for (const record of records) {
      for (const key of Object.keys(record)) seen.add(key);
    }
    cols = Array.from(seen);
  }

  const lines: string[] = [];
  lines.push(cols.map((c) => escapeCsvValue(c)).join(','));
  for (const record of records) {
    lines.push(cols.map((c) => escapeCsvValue(record[c])).join(','));
  }
  return lines.join('\r\n');
}
