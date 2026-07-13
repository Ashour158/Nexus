'use client';

import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useRecordLayout, type LayoutSection, type LayoutDirectives } from '@/hooks/use-record-layout';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * Renders a record's fields grouped into the caller's assigned page layout
 * (sections + order) and applies the layout engine's evaluated directives
 * (hidden sections/fields, required/readonly markers).
 *
 * PROGRESSIVE ENHANCEMENT: while the layout resolves — or if none resolves /
 * the call errors — it renders `fallback` unchanged (the page's existing static
 * layout). It only takes over once a real layout is active.
 */

export interface DynamicRecordLayoutProps {
  /** Module key passed to the layout engine, e.g. `deal`, `account`. */
  module: string;
  /** The live record whose field values are displayed + evaluated. */
  record: Record<string, unknown>;
  /** Existing static layout, shown while loading and when no layout resolves. */
  fallback?: ReactNode;
  /** Optional per-field label overrides (fieldKey → label). */
  labels?: Record<string, string>;
  /** Optional per-field custom renderer (wins over the generic formatter). */
  renderField?: (fieldKey: string, value: unknown) => ReactNode;
  /**
   * When true, required/readonly directives are surfaced as markers (edit mode).
   * In read mode they are still applied but shown subtly.
   */
  editMode?: boolean;
  className?: string;
}

// ── Generic value formatting ─────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}(T|$)/;
const CURRENCY_HINT = /(amount|value|price|mrr|arr|revenue|cost|total)/i;

function humanize(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .replace(/\bId\b/g, 'ID')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatValue(fieldKey: string, value: unknown, currency: string): ReactNode {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map((v) => String(v)).join(', ') : '—';
  if (typeof value === 'object') return '—';
  const str = String(value);
  if (DATE_RE.test(str)) {
    const d = new Date(str);
    if (!Number.isNaN(d.getTime())) return formatDate(str);
  }
  if (CURRENCY_HINT.test(fieldKey) && str.trim() !== '' && !Number.isNaN(Number(str))) {
    return formatCurrency(Number(str), currency);
  }
  return str;
}

// ── Component ────────────────────────────────────────────────────────────────

export function DynamicRecordLayout({
  module,
  record,
  fallback = null,
  labels,
  renderField,
  editMode = false,
  className,
}: DynamicRecordLayoutProps): JSX.Element {
  const { layout, directives, state } = useRecordLayout(module, record);

  // While loading, or when no layout resolves, keep the existing static layout.
  if (state !== 'active' || !layout) {
    return <>{fallback}</>;
  }

  const currency = String((record as { currency?: unknown }).currency ?? 'USD');
  const hiddenSections = new Set(directives.hiddenSections);
  const hiddenFields = new Set(directives.hiddenFields);
  const requiredFields = new Set(directives.requiredFields);
  const readonlyFields = new Set(directives.readonlyFields);

  const visibleSections = layout.sections
    .map((section, index) => ({ section, index }))
    .filter(({ section, index }) => !isSectionHidden(section, index, hiddenSections));

  if (visibleSections.length === 0) {
    // A layout resolved but every section is hidden by the rules — degrade to
    // the fallback rather than showing an empty shell.
    return <>{fallback}</>;
  }

  return (
    <div className={cn('space-y-4', className)} data-testid="dynamic-record-layout" data-layout-id={layout.id}>
      {visibleSections.map(({ section, index }) => {
        const fields = (section.fields ?? []).filter((f) => !hiddenFields.has(f));
        const cols = Math.min(Math.max(section.columns ?? 1, 1), 2);
        return (
          <section key={section.id ?? `section-${index}`} className="rounded-xl border border-outline-variant bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                {section.title ?? humanize(String(section.id ?? `Section ${index + 1}`))}
              </h2>
            </div>
            {fields.length === 0 ? (
              <p className="text-xs text-on-surface-variant">No visible fields in this section.</p>
            ) : (
              <dl className={cn('grid gap-x-6 gap-y-2 text-sm', cols === 2 ? 'sm:grid-cols-2' : 'grid-cols-1')}>
                {fields.map((field) => {
                  const label = labels?.[field] ?? humanize(field);
                  const isRequired = requiredFields.has(field);
                  const isReadonly = readonlyFields.has(field);
                  const rendered = renderField
                    ? renderField(field, record[field])
                    : formatValue(field, record[field], currency);
                  return (
                    <div key={field} className="flex items-start gap-2">
                      <dt className="flex w-28 shrink-0 items-center gap-1 text-xs uppercase tracking-wider text-on-surface-variant">
                        <span>{label}</span>
                        {isRequired ? (
                          <span className="text-error" aria-label="required" title="Required">
                            *
                          </span>
                        ) : null}
                        {isReadonly ? (
                          <Lock className="h-3 w-3 text-on-surface-variant" aria-label="read only" />
                        ) : null}
                      </dt>
                      <dd
                        className={cn(
                          'flex-1 text-on-surface',
                          editMode && isReadonly && 'opacity-70',
                          editMode && isRequired && String(record[field] ?? '') === '' && 'text-error'
                        )}
                      >
                        {rendered}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </section>
        );
      })}
    </div>
  );
}

function isSectionHidden(section: LayoutSection, index: number, hidden: Set<string>): boolean {
  if (hidden.size === 0) return false;
  const id = section.id ? String(section.id) : '';
  const title = section.title ? String(section.title) : '';
  return (
    (id && hidden.has(id)) ||
    (title && hidden.has(title)) ||
    hidden.has(`section-${index}`) ||
    false
  );
}

export type { LayoutDirectives };
