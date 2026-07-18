import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { isExportFormat, toCsv, toPrintableHtml, toXlsx, type ExportColumn } from '../bi-export.js';

const COLUMNS: ExportColumn[] = [
  { key: 'industry', label: 'Industry', type: 'string' },
  { key: 'pipeline', label: 'Pipeline', type: 'money' },
  { key: 'deals', label: 'Deals', type: 'number' },
];

const ROWS = [
  { industry: 'Retail', pipeline: 1342000, deals: 4 },
  { industry: 'Technology', pipeline: 780000, deals: 2 },
];

describe('isExportFormat', () => {
  it('accepts the supported formats and rejects anything else', () => {
    expect(isExportFormat('csv')).toBe(true);
    expect(isExportFormat('xlsx')).toBe(true);
    expect(isExportFormat('pdf')).toBe(true);
    expect(isExportFormat('exe')).toBe(false);
    expect(isExportFormat(undefined)).toBe(false);
  });
});

describe('toCsv', () => {
  it('writes a header of labels plus one line per row', () => {
    const csv = toCsv(COLUMNS, ROWS);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('"Industry","Pipeline","Deals"');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"Retail"');
  });

  it('escapes embedded quotes rather than breaking the field', () => {
    const csv = toCsv([{ key: 'a', label: 'A' }], [{ a: 'say "hi"' }]);
    expect(csv.split('\r\n')[1]).toBe('"say ""hi"""');
  });

  it('neutralises a formula-injection payload', () => {
    // Excel executes a cell starting with `=`; the export must not hand the
    // opener a live formula.
    const csv = toCsv([{ key: 'a', label: 'A' }], [{ a: '=cmd|calc' }]);
    const cell = csv.split('\r\n')[1];
    expect(cell.startsWith('"=')).toBe(false);
    expect(cell).toContain("'=cmd|calc");
  });

  it('neutralises the other formula-trigger characters too', () => {
    for (const payload of ['+1', '-1+2', '@SUM(A1)']) {
      const cell = toCsv([{ key: 'a', label: 'A' }], [{ a: payload }]).split('\r\n')[1];
      expect(cell).toBe(`"'${payload}"`);
    }
  });

  it('renders null/undefined as empty rather than the string "null"', () => {
    const csv = toCsv([{ key: 'a', label: 'A' }], [{ a: null }, { a: undefined }]);
    expect(csv.split('\r\n').slice(1)).toEqual(['""', '""']);
  });
});

describe('toXlsx', () => {
  it('produces a real xlsx workbook that parses back to the same values', () => {
    const buf = toXlsx(COLUMNS, ROWS, 'Pipeline by industry');
    // A genuine xlsx is a ZIP — "PK" magic bytes. A CSV renamed .xlsx would not be.
    expect(buf.subarray(0, 2).toString()).toBe('PK');

    const book = XLSX.read(buf, { type: 'buffer' });
    const sheet = book.Sheets[book.SheetNames[0]];
    const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].Industry).toBe('Retail');
  });

  it('writes numeric columns as numbers so Excel can sum them', () => {
    const buf = toXlsx(COLUMNS, ROWS);
    const book = XLSX.read(buf, { type: 'buffer' });
    const sheet = book.Sheets[book.SheetNames[0]];
    // B2 is the first Pipeline value.
    expect(sheet.B2.t).toBe('n');
    expect(sheet.B2.v).toBe(1342000);
  });

  it('sanitises a sheet name Excel would reject', () => {
    const book = XLSX.read(toXlsx(COLUMNS, ROWS, 'a/b:c*d?e[f]g'), { type: 'buffer' });
    expect(book.SheetNames[0]).not.toMatch(/[[\]:*?/\\]/);
  });

  it('truncates a sheet name past the 31-char limit', () => {
    const book = XLSX.read(toXlsx(COLUMNS, ROWS, 'x'.repeat(60)), { type: 'buffer' });
    expect(book.SheetNames[0].length).toBeLessThanOrEqual(31);
  });
});

describe('toPrintableHtml', () => {
  const at = new Date('2026-07-16T10:00:00.000Z');

  it('includes the title, every column label, and the row count', () => {
    const html = toPrintableHtml('Pipeline', COLUMNS, ROWS, at);
    expect(html).toContain('Pipeline');
    expect(html).toContain('Industry');
    expect(html).toContain('2 row(s)');
  });

  it('escapes markup in data so a record cannot inject script into the PDF', () => {
    const html = toPrintableHtml('T', [{ key: 'a', label: 'A' }], [{ a: '<script>alert(1)</script>' }], at);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes markup in the report title too', () => {
    const html = toPrintableHtml('<img src=x onerror=1>', COLUMNS, ROWS, at);
    expect(html).not.toContain('<img src=x');
  });

  it('stays self-contained — no external resource for the renderer to fetch', () => {
    // The renderer is a headless browser inside the private network, so any
    // remote reference would be an SSRF primitive.
    const html = toPrintableHtml('T', COLUMNS, ROWS, at);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/https?:\/\//i);
  });
});
