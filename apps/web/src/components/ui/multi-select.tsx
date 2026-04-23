'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface MultiSelectOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface MultiSelectProps {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiSelectOption[];
  onSearchChange?: (search: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  isLoading?: boolean;
  describedBy?: string;
}

/**
 * Accessible multi-select with chip display + searchable dropdown.
 *
 * Selected items are rendered as dismissible chips in the trigger area; the
 * dropdown contains a search input and a checkbox list of options. The parent
 * supplies the option list (optionally refreshing it via `onSearchChange`).
 */
export function MultiSelect({
  id,
  value,
  onChange,
  options,
  onSearchChange,
  placeholder = 'Select…',
  disabled = false,
  invalid = false,
  isLoading = false,
  describedBy,
}: MultiSelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selectedOptions = useMemo(
    () =>
      value
        .map((id) => options.find((o) => o.id === id))
        .filter((o): o is MultiSelectOption => Boolean(o)),
    [value, options]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel ?? '').toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (optionId: string) => {
    if (value.includes(optionId)) {
      onChange(value.filter((v) => v !== optionId));
    } else {
      onChange([...value, optionId]);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'flex min-h-9 w-full flex-wrap items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-left text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          'disabled:cursor-not-allowed disabled:opacity-60',
          invalid && 'border-destructive focus-visible:ring-destructive'
        )}
      >
        {selectedOptions.length === 0 ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          selectedOptions.map((opt) => (
            <span
              key={opt.id}
              className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs"
            >
              {opt.label}
              <span
                role="button"
                aria-label={`Remove ${opt.label}`}
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(opt.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    toggle(opt.id);
                  }
                }}
                className="cursor-pointer text-muted-foreground hover:text-foreground"
              >
                ×
              </span>
            </span>
          ))
        )}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-background shadow-lg">
          <div className="border-b border-border p-2">
            <input
              type="text"
              value={query}
              placeholder="Search…"
              onChange={(e) => {
                setQuery(e.target.value);
                onSearchChange?.(e.target.value);
              }}
              className="h-8 w-full rounded border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-auto py-1">
            {isLoading && (
              <li className="px-3 py-2 text-xs text-muted-foreground">
                Loading…
              </li>
            )}
            {!isLoading && filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted-foreground">
                No results
              </li>
            )}
            {!isLoading &&
              filtered.map((opt) => {
                const checked = value.includes(opt.id);
                return (
                  <li key={opt.id} role="option" aria-selected={checked}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(opt.id)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="flex-1">
                        <div className="truncate">{opt.label}</div>
                        {opt.sublabel && (
                          <div className="truncate text-xs text-muted-foreground">
                            {opt.sublabel}
                          </div>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}
