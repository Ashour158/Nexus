'use client';

import { Search, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface FilterOption {
  label: string;
  value: string;
}

interface FilterBarProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filters?: Array<{
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (value: string) => void;
  }>;
  onRefresh?: () => void;
  className?: string;
}

export function FilterBar({
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  filters,
  onRefresh,
  className,
}: FilterBarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border p-3',
        className
      )}
      style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-color)' }}
    >
      {onSearchChange ? (
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchValue ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-lg border bg-transparent ps-9 pe-3 text-sm outline-none focus:border-primary"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            aria-label={searchPlaceholder}
          />
        </div>
      ) : null}

      {filters?.map((f) => (
        <div key={f.label} className="flex items-center gap-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            {f.label}
          </span>
          <select
            value={f.value}
            aria-label={f.label}
            onChange={(e) => f.onChange(e.target.value)}
            className="h-9 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus:border-primary"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          className="ms-auto inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition hover:bg-surface-container-low dark:hover:bg-surface-container-highest"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          aria-label="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      ) : null}
    </div>
  );
}
