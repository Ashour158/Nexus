'use client';

import { useEffect, useMemo, useState } from 'react';
import { useBff } from '@/lib/use-bff';

/**
 * Progressive-enhancement hook for the deployed page-layout engine
 * (metadata-service `/layouts/*`).
 *
 * It resolves the caller's assigned layout for a module and then evaluates the
 * live record's values against the layout's rules to obtain UI directives
 * (hidden/required/readonly). It is a PURE ENHANCEMENT: any failure (404, empty,
 * network) collapses to `state: 'fallback'` so the caller renders its existing
 * static layout with zero regression. It never throws.
 */

// ── Wire shapes (mirror metadata-service) ────────────────────────────────────

export interface LayoutSection {
  id?: string;
  title?: string;
  columns?: number;
  fields?: string[];
  [k: string]: unknown;
}

export interface ResolvedLayout {
  id: string;
  module: string;
  name: string;
  sections: LayoutSection[];
}

export interface LayoutDirectives {
  hiddenFields: string[];
  hiddenSections: string[];
  requiredFields: string[];
  readonlyFields: string[];
}

/**
 * - `loading`  — the resolve call is in flight (render the fallback, no flash).
 * - `active`   — a layout resolved; render the dynamic sections.
 * - `fallback` — no layout / error; render the existing static layout.
 */
export type RecordLayoutState = 'loading' | 'active' | 'fallback';

const EMPTY_DIRECTIVES: LayoutDirectives = {
  hiddenFields: [],
  hiddenSections: [],
  requiredFields: [],
  readonlyFields: [],
};

function normalizeDirectives(raw: unknown): LayoutDirectives {
  const r = (raw ?? {}) as Partial<LayoutDirectives>;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
  return {
    hiddenFields: arr(r.hiddenFields),
    hiddenSections: arr(r.hiddenSections),
    requiredFields: arr(r.requiredFields),
    readonlyFields: arr(r.readonlyFields),
  };
}

function isRenderableLayout(data: unknown): data is ResolvedLayout {
  if (!data || typeof data !== 'object') return false;
  const l = data as Partial<ResolvedLayout>;
  return typeof l.id === 'string' && Array.isArray(l.sections) && l.sections.length > 0;
}

export interface UseRecordLayoutResult {
  layout: ResolvedLayout | null;
  directives: LayoutDirectives;
  state: RecordLayoutState;
  /** True only when a real layout resolved and should drive the render. */
  hasLayout: boolean;
}

export function useRecordLayout(
  module: string,
  record: Record<string, unknown> | null | undefined
): UseRecordLayoutResult {
  const { get, post } = useBff();
  const [layout, setLayout] = useState<ResolvedLayout | null>(null);
  const [directives, setDirectives] = useState<LayoutDirectives>(EMPTY_DIRECTIVES);
  const [state, setState] = useState<RecordLayoutState>('loading');

  // Resolve the layout once per module (or token change).
  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setLayout(null);
    setDirectives(EMPTY_DIRECTIVES);
    void (async () => {
      const res = await get<ResolvedLayout | null>(
        `/bff/metadata/layouts/resolve?module=${encodeURIComponent(module)}`
      );
      if (cancelled) return;
      if (res.ok && isRenderableLayout(res.data)) {
        setLayout(res.data);
        setState('active');
      } else {
        setLayout(null);
        setState('fallback');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [module, get]);

  // Stable dependency for the record so evaluate re-runs on value changes only.
  const recordKey = useMemo(() => {
    try {
      return JSON.stringify(record ?? {});
    } catch {
      return '';
    }
  }, [record]);

  // Evaluate rules against the live record whenever the layout or values change.
  useEffect(() => {
    if (!layout) return;
    let cancelled = false;
    void (async () => {
      const res = await post<LayoutDirectives>(`/bff/metadata/layouts/${layout.id}/evaluate`, {
        record: record ?? {},
      });
      if (cancelled) return;
      setDirectives(res.ok && res.data ? normalizeDirectives(res.data) : EMPTY_DIRECTIVES);
    })();
    return () => {
      cancelled = true;
    };
    // recordKey captures record-value changes; `record` itself is intentionally
    // omitted to avoid re-running on referentially-unstable objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, recordKey, post]);

  return {
    layout,
    directives,
    state,
    hasLayout: state === 'active' && layout !== null,
  };
}
