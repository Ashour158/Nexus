import { describe, expect, it } from 'vitest';
import { escapeCsvValue, serializeCsv } from '../lib/csv.js';

describe('escapeCsvValue — CSV/formula injection', () => {
  it('neutralizes cells starting with = + - @ by prefixing a single quote', () => {
    expect(escapeCsvValue('=1+1')).toBe("'=1+1");
    expect(escapeCsvValue('+1')).toBe("'+1");
    expect(escapeCsvValue('-1')).toBe("'-1");
    expect(escapeCsvValue('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('neutralizes cells starting with tab or CR', () => {
    expect(escapeCsvValue('\t=1')).toBe("'\t=1");
    // A leading CR also triggers RFC-4180 quoting after the guard is applied.
    expect(escapeCsvValue('\r=1')).toBe('"\'\r=1"');
  });

  it('neutralizes the classic command-injection payload', () => {
    // No comma/double-quote/newline in the payload, so only the guard prefix
    // is applied (no RFC-4180 wrapping).
    expect(escapeCsvValue('=CMD|\'/c calc\'!A1')).toBe('\'=CMD|\'/c calc\'!A1');
  });

  it('leaves benign values untouched', () => {
    expect(escapeCsvValue('hello')).toBe('hello');
    expect(escapeCsvValue('123')).toBe('123');
    expect(escapeCsvValue('a=b')).toBe('a=b'); // '=' not leading → safe
    expect(escapeCsvValue('')).toBe('');
    expect(escapeCsvValue(null)).toBe('');
    expect(escapeCsvValue(undefined)).toBe('');
  });

  it('applies the guard before RFC-4180 quoting for values with commas', () => {
    expect(escapeCsvValue('=1,2')).toBe('"\'=1,2"');
  });

  it('guards formula payloads inside serialized rows', () => {
    const csv = serializeCsv([{ name: '=HYPERLINK("http://evil")' }], ['name']);
    const [, dataLine] = csv.split('\r\n');
    expect(dataLine.startsWith('"\'=')).toBe(true);
  });
});
