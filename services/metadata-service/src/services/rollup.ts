/**
 * Pure ROLLUP_SUMMARY compute helper.
 *
 * A rollup field aggregates a child/related record set (COUNT / SUM / MIN / MAX
 * / AVG of a child field, with an optional equality filter). The *event-driven*
 * recompute (listening for child create/update/delete) lives in crm-service;
 * this module only defines the config-driven aggregation so both services agree
 * on the math. Pure + total: never throws.
 */

import type { RollupConfig } from './field-config.js';

export interface RollupResult {
  function: RollupConfig['function'];
  field: string | null;
  value: number | null;
  count: number;
}

/** Coerce a value to a finite number, or null if it isn't one. */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Shallow equality filter: every filter key must strictly match (stringified). */
function matchesFilter(row: Record<string, unknown>, filter?: Record<string, unknown>): boolean {
  if (!filter) return true;
  for (const [k, expected] of Object.entries(filter)) {
    const actual = row[k];
    if (actual === expected) continue;
    if (String(actual ?? '') !== String(expected ?? '')) return false;
  }
  return true;
}

/**
 * Compute a rollup aggregate over `rows` (child records). For COUNT the child
 * field is irrelevant (rows matching the filter are counted). For the numeric
 * aggregates, non-numeric / missing child-field values are skipped.
 */
export function computeRollup(config: RollupConfig, rows: Array<Record<string, unknown>>): RollupResult {
  const filtered = Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object' && matchesFilter(r, config.filter)) : [];

  if (config.function === 'COUNT') {
    return { function: 'COUNT', field: null, value: filtered.length, count: filtered.length };
  }

  const field = config.childField ?? null;
  const nums: number[] = [];
  if (field) {
    for (const row of filtered) {
      const n = toNumber(row[field]);
      if (n !== null) nums.push(n);
    }
  }

  let value: number | null = null;
  switch (config.function) {
    case 'SUM':
      value = nums.reduce((a, b) => a + b, 0);
      break;
    case 'MIN':
      value = nums.length ? Math.min(...nums) : null;
      break;
    case 'MAX':
      value = nums.length ? Math.max(...nums) : null;
      break;
    case 'AVG':
      value = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      break;
    default:
      value = null;
  }

  return { function: config.function, field, value, count: nums.length };
}

/** Compute a rollup directly from a list of pre-extracted numeric values. */
export function computeRollupFromValues(config: RollupConfig, values: number[]): RollupResult {
  const nums = (Array.isArray(values) ? values : []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (config.function === 'COUNT') {
    return { function: 'COUNT', field: config.childField ?? null, value: nums.length, count: nums.length };
  }
  let value: number | null = null;
  switch (config.function) {
    case 'SUM':
      value = nums.reduce((a, b) => a + b, 0);
      break;
    case 'MIN':
      value = nums.length ? Math.min(...nums) : null;
      break;
    case 'MAX':
      value = nums.length ? Math.max(...nums) : null;
      break;
    case 'AVG':
      value = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      break;
    default:
      value = null;
  }
  return { function: config.function, field: config.childField ?? null, value, count: nums.length };
}
