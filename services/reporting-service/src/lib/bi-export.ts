import * as XLSX from 'xlsx';

/**
 * Export rendering for BI (ReportSpec) results.
 *
 * The BI path previously had NO export at all — CSV/XLSX existed only on the
 * legacy SavedReport path, and the one route named "pdf" returned HTML. These
 * produce the real formats from a compiled result.
 */

export interface ExportColumn {
  key: string;
  label: string;
  type?: string;
}

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export const EXPORT_FORMATS: readonly ExportFormat[] = ['csv', 'xlsx', 'pdf'];

export function isExportFormat(v: unknown): v is ExportFormat {
  return typeof v === 'string' && (EXPORT_FORMATS as readonly string[]).includes(v);
}

/**
 * Quote a CSV field per RFC 4180.
 *
 * The leading-quote on formula-triggering characters is deliberate: a cell
 * beginning `=`, `+`, `-`, or `@` is executed as a formula when the file is
 * opened in Excel/Sheets, so a CRM record whose name is `=cmd|...` becomes a
 * CSV-injection payload aimed at whoever opens the export.
 */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  const risky = /^[=+\-@\t\r]/.test(s);
  const body = risky ? `'${s}` : s;
  return `"${body.replace(/"/g, '""')}"`;
}

export function toCsv(columns: ExportColumn[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => csvCell(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => csvCell(row[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}

/**
 * A real .xlsx workbook — not a CSV with an xlsx extension.
 * Numeric/money columns are written as numbers so Excel can sum them.
 */
export function toXlsx(columns: ExportColumn[], rows: Record<string, unknown>[], sheetName = 'Report'): Buffer {
  const numeric = new Set(columns.filter((c) => c.type === 'number' || c.type === 'money').map((c) => c.key));
  const aoa: unknown[][] = [columns.map((c) => c.label)];
  for (const row of rows) {
    aoa.push(
      columns.map((c) => {
        const v = row[c.key];
        if (v === null || v === undefined) return '';
        if (numeric.has(c.key)) {
          const n = Number(v);
          return Number.isFinite(n) ? n : v;
        }
        return v;
      })
    );
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  // Roughly fit columns to their header so the file is readable on open.
  sheet['!cols'] = columns.map((c) => ({ wch: Math.min(Math.max(c.label.length + 2, 10), 40) }));
  const book = XLSX.utils.book_new();
  // Excel rejects sheet names over 31 chars or containing []:*?/\
  XLSX.utils.book_append_sheet(book, sheet, sheetName.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Report');
  return XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Print-ready HTML for the PDF renderer.
 *
 * MUST stay self-contained — no external stylesheet, font, or image. The
 * renderer is a headless Chromium inside the private network, so any remote
 * reference here would be fetched from there (an SSRF primitive). Every value
 * is escaped.
 */
export function toPrintableHtml(
  title: string,
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
  generatedAt: Date
): string {
  const numeric = new Set(columns.filter((c) => c.type === 'number' || c.type === 'money').map((c) => c.key));
  const head = columns
    .map((c) => `<th${numeric.has(c.key) ? ' class="num"' : ''}>${escapeHtml(c.label)}</th>`)
    .join('');
  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => {
            const v = row[c.key];
            const text = v === null || v === undefined || v === '' ? '—' : v;
            return `<td${numeric.has(c.key) ? ' class="num"' : ''}>${escapeHtml(text)}</td>`;
          })
          .join('')}</tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: Helvetica, Arial, sans-serif; color: #1f2430; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #6b7280; font-size: 11px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead { display: table-header-group; }
  th { background: #f3f4f6; padding: 6px 8px; text-align: left; border-bottom: 1.5px solid #d1d5db; font-weight: 600; }
  td { padding: 5px 8px; border-bottom: 1px solid #eef0f3; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Generated ${escapeHtml(generatedAt.toISOString())} · ${rows.length} row(s)</div>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
}

const PDF_TIMEOUT_MS = 30000;

/**
 * Render HTML to a real PDF via document-service, which already ships the
 * headless Chromium. Throws on failure — an export that silently returns
 * something other than a PDF is worse than a visible error.
 */
export async function renderPdfViaDocumentService(html: string): Promise<Buffer> {
  const base = process.env.DOCUMENT_SERVICE_URL ?? 'http://document-service:3016';
  const token = process.env.INTERNAL_SERVICE_TOKEN ?? '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDF_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/v1/internal/documents/html-to-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-service-token': token },
      body: JSON.stringify({ html }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`pdf render failed: ${res.status} ${text.slice(0, 300)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}
