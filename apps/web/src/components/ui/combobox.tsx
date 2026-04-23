'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { cn } from '@/lib/cn';

export interface ComboboxOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface ComboboxProps {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: ComboboxOption[];
  /** Called when the typed search text changes — lets parents fetch async. */
  onSearchChange?: (search: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  isLoading?: boolean;
  emptyLabel?: string;
  describedBy?: string;
}

/**
 * Accessible single-select combobox with keyboard support.
 *
 * The parent owns the selected `value` (an id). Filtering is performed
 * locally on the `options` array and, when `onSearchChange` is provided, the
 * parent can re-fetch the option list asynchronously (e.g. from the accounts
 * search API) based on the user's input.
 */
export function Combobox({
  id,
  value,
  onChange,
  options,
  onSearchChange,
  placeholder = 'Search…',
  disabled = false,
  invalid = false,
  isLoading = false,
  emptyLabel = 'No results',
  describedBy,
}: ComboboxProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value]
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
    if (activeIndex >= filtered.length) setActiveIndex(0);
  }, [filtered.length, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback(
    (opt: ComboboxOption) => {
      onChange(opt.id);
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
    },
    [onChange]
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const choice = filtered[activeIndex];
      if (choice) handleSelect(choice);
    } else if (event.key === 'Escape') {
      setOpen(false);
    } else if (event.key === 'Backspace' && query === '' && value) {
      onChange(null);
    }
  };

  const displayValue = open ? query : selected?.label ?? '';

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        disabled={disabled}
        value={displayValue}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          setActiveIndex(0);
          onSearchChange?.(next);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          'disabled:cursor-not-allowed disabled:opacity-60',
          invalid && 'border-destructive focus-visible:ring-destructive'
        )}
      />

      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-background shadow-lg"
        >
          {isLoading && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              Loading…
            </li>
          )}
          {!isLoading && filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {emptyLabel}
            </li>
          )}
          {!isLoading &&
            filtered.map((opt, index) => {
              const isActive = index === activeIndex;
              const isSelected = opt.id === value;
              return (
                <li
                  key={opt.id}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(opt);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'cursor-pointer px-3 py-2 text-sm',
                    isActive && 'bg-muted',
                    isSelected && 'font-semibold'
                  )}
                >
                  <div className="truncate">{opt.label}</div>
                  {opt.sublabel && (
                    <div className="truncate text-xs text-muted-foreground">
                      {opt.sublabel}
                    </div>
                  )}
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
