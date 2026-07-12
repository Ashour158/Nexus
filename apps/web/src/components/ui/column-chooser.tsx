'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Settings2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ColumnDef {
  key: string;
  label: string;
}

function getStorageKey(module: string): string {
  return `nexus_columns_${module}`;
}

export function useColumnVisibility(module: string, allColumns: ColumnDef[]) {
  const allKeys = useMemo(() => allColumns.map((c) => c.key), [allColumns]);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(allKeys);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getStorageKey(module));
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        // Validate that stored keys are still valid
        const valid = parsed.filter((k) => allKeys.includes(k));
        if (valid.length > 0) {
          setVisibleKeys(valid);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [module, allKeys]);

  const persist = useCallback(
    (keys: string[]) => {
      setVisibleKeys(keys);
      try {
        localStorage.setItem(getStorageKey(module), JSON.stringify(keys));
      } catch {
        // ignore quota errors
      }
    },
    [module]
  );

  const reset = useCallback(() => {
    persist(allKeys);
  }, [allKeys, persist]);

  const moveKey = useCallback(
    (key: string, direction: -1 | 1) => {
      setVisibleKeys((prev) => {
        const idx = prev.indexOf(key);
        if (idx < 0) return prev;
        const next = [...prev];
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= next.length) return prev;
        const tmp = next[idx];
        next[idx] = next[newIdx];
        next[newIdx] = tmp;
        try {
          localStorage.setItem(getStorageKey(module), JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [module]
  );

  return { visibleKeys, setVisibleKeys: persist, reset, moveKey, allColumns };
}

interface ColumnChooserProps {
  allColumns: ColumnDef[];
  visibleKeys: string[];
  onChange: (keys: string[]) => void;
  onReset: () => void;
  onMove?: (key: string, direction: -1 | 1) => void;
  className?: string;
}

export function ColumnChooser({
  allColumns,
  visibleKeys,
  onChange,
  onReset,
  onMove,
  className,
}: ColumnChooserProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const toggleKey = (key: string) => {
    const next = visibleKeys.includes(key)
      ? visibleKeys.filter((k) => k !== key)
      : [...visibleKeys, key];
    onChange(next);
  };

  return (
    <div className={cn('relative', className)} ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition hover:bg-surface-container-low"
        style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
        aria-label="Choose columns"
        aria-expanded={open}
        title="Choose columns"
      >
        <Settings2 className="h-4 w-4" />
        <span className="hidden sm:inline">Columns</span>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            className="absolute end-0 z-20 mt-1 w-56 rounded-lg border py-2 shadow-lg"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-color)' }}
          >
            <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Visible columns
            </div>
            <div className="max-h-72 overflow-y-auto px-2">
              {allColumns.map((col, idx) => {
                const isVisible = visibleKeys.includes(col.key);
                return (
                  <label
                    key={col.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-container-low"
                  >
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => toggleKey(col.key)}
                      className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary"
                    />
                    <span className="flex-1" style={{ color: 'var(--text-primary)' }}>
                      {col.label}
                    </span>
                    {onMove ? (
                      <span className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            onMove(col.key, -1);
                          }}
                          className="rounded p-0.5 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30"
                          title="Move up"
                        >
                          <GripVertical className="h-3 w-3 rotate-180" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === allColumns.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            onMove(col.key, 1);
                          }}
                          className="rounded p-0.5 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-30"
                          title="Move down"
                        >
                          <GripVertical className="h-3 w-3" />
                        </button>
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
            <div className="border-t px-3 pt-2" style={{ borderColor: 'var(--border-color)' }}>
              <button
                type="button"
                onClick={onReset}
                className="text-xs font-medium hover:underline"
                style={{ color: 'var(--text-muted)' }}
              >
                Reset to default
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
