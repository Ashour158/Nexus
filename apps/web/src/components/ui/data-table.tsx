'use client';

import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ColumnChooser } from './column-chooser';
import type { ColumnDef } from './column-chooser';

export type SortDir = 'asc' | 'desc' | null;

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string;
  sortKey?: string;
  sortDir?: SortDir;
  onSort?: (key: string, dir: SortDir) => void;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
  };
  loading?: boolean;
  emptyState?: ReactNode;
  className?: string;
  rowClassName?: (row: T) => string;
  selectedIds?: Set<string>;
  onSelect?: (id: string, checked: boolean) => void;
  onSelectAll?: (checked: boolean) => void;
  bulkActions?: ReactNode;
  columnChooser?: {
    allColumns: ColumnDef[];
    visibleKeys: string[];
    onChange: (keys: string[]) => void;
    onReset: () => void;
    onMove?: (key: string, direction: -1 | 1) => void;
  };
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  sortKey,
  sortDir,
  onSort,
  pagination,
  loading,
  emptyState,
  className,
  rowClassName,
  selectedIds,
  onSelect,
  onSelectAll,
  bulkActions,
  columnChooser,
}: DataTableProps<T>) {
  const [internalSortKey, setInternalSortKey] = useState<string | undefined>(sortKey);
  const [internalSortDir, setInternalSortDir] = useState<SortDir>(sortDir ?? null);

  const resolvedSortKey = sortKey ?? internalSortKey;
  const resolvedSortDir = sortDir ?? internalSortDir;

  const handleSort = (key: string) => {
    let nextDir: SortDir = 'asc';
    if (resolvedSortKey === key) {
      if (resolvedSortDir === 'asc') nextDir = 'desc';
      else if (resolvedSortDir === 'desc') nextDir = null;
    }
    if (onSort) {
      onSort(key, nextDir);
    } else {
      setInternalSortKey(nextDir ? key : undefined);
      setInternalSortDir(nextDir);
    }
  };

  const sortedData = useMemo(() => {
    if (!resolvedSortKey || !resolvedSortDir) return data;
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[resolvedSortKey];
      const bVal = (b as Record<string, unknown>)[resolvedSortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return resolvedSortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return resolvedSortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [data, resolvedSortKey, resolvedSortDir]);

  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;

  const allSelected = data.length > 0 && data.every((row) => selectedIds?.has(keyExtractor(row)));
  const someSelected = !allSelected && data.some((row) => selectedIds?.has(keyExtractor(row)));

  const filteredColumns = useMemo(() => {
    if (!columnChooser) return columns;
    const set = new Set(columnChooser.visibleKeys);
    return columns.filter((c) => set.has(c.key));
  }, [columns, columnChooser]);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {columnChooser ? (
          <ColumnChooser
            allColumns={columnChooser.allColumns}
            visibleKeys={columnChooser.visibleKeys}
            onChange={columnChooser.onChange}
            onReset={columnChooser.onReset}
            onMove={columnChooser.onMove}
          />
        ) : null}
        {selectedIds && selectedIds.size > 0 && bulkActions ? (
        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2"
          style={{ backgroundColor: 'var(--accent-light)', borderColor: 'var(--accent)' }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
            {selectedIds.size} selected
          </span>
          <div className="ms-auto">{bulkActions}</div>
        </div>
      ) : null}
      </div>

      <div
        className="overflow-hidden rounded-xl border"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-color)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead
              className="border-b text-left"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}
            >
              <tr>
                {onSelect ? (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected ?? false;
                      }}
                      onChange={(e) => onSelectAll?.(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      aria-label="Select all rows"
                    />
                  </th>
                ) : null}
                {filteredColumns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-xs font-medium uppercase tracking-wider',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right',
                      col.sortable && 'cursor-pointer select-none'
                    )}
                    style={{ color: 'var(--text-muted)', width: col.width }}
                    onClick={() => col.sortable && handleSort(col.key)}
                    onKeyDown={(e) => {
                      if (col.sortable && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        handleSort(col.key);
                      }
                    }}
                    tabIndex={col.sortable ? 0 : undefined}
                    role={col.sortable ? 'button' : undefined}
                    aria-sort={
                      resolvedSortKey === col.key
                        ? resolvedSortDir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable ? (
                        <span className="inline-flex flex-col">
                          <ChevronUp
                            className={cn(
                              'h-3 w-3 -mb-1',
                              resolvedSortKey === col.key && resolvedSortDir === 'asc'
                                ? 'text-primary'
                                : 'text-gray-300'
                            )}
                          />
                          <ChevronDown
                            className={cn(
                              'h-3 w-3',
                              resolvedSortKey === col.key && resolvedSortDir === 'desc'
                                ? 'text-primary'
                                : 'text-gray-300'
                            )}
                          />
                        </span>
                      ) : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {loading ? (
                <TableLoadingRows cols={filteredColumns.length + (onSelect ? 1 : 0)} rows={5} />
              ) : sortedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (onSelect ? 1 : 0)} className="px-4 py-12">
                    {emptyState ?? (
                      <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                        No data available
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                sortedData.map((row) => {
                  const id = keyExtractor(row);
                  return (
                    <tr
                      key={id}
                      className={cn(
                        'transition-colors hover:bg-surface-container-high',
                        rowClassName?.(row),
                        selectedIds?.has(id) && 'bg-primary-container/40'
                      )}
                    >
                      {onSelect ? (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds?.has(id) ?? false}
                            onChange={(e) => onSelect(id, e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            aria-label={`Select row ${id}`}
                          />
                        </td>
                      ) : null}
                      {filteredColumns.map((col) => (
                        <td
                          key={col.key}
                          className={cn(
                            'px-4 py-3',
                            col.align === 'center' && 'text-center',
                            col.align === 'right' && 'text-right'
                          )}
                        >
                          {col.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pagination ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Showing{' '}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {Math.min((pagination.page - 1) * pagination.pageSize + 1, pagination.total)}
            </span>{' '}
            -{' '}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {Math.min(pagination.page * pagination.pageSize, pagination.total)}
            </span>{' '}
            of{' '}
            <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {pagination.total}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border-color)' }}
              aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border-color)' }}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Page {pagination.page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border-color)' }}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onPageChange(totalPages)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40"
              style={{ borderColor: 'var(--border-color)' }}
              aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TableLoadingRows({ cols, rows }: { cols: number; rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 animate-pulse rounded bg-gray-200 dark:bg-slate-700" style={{ width: j === 0 ? '60%' : '80%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function DataTableActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
      }
      if (e.key === 'Tab') {
        const focusable = menuRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className={cn('relative', className)} ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
        style={{ color: 'var(--text-muted)' }}
        aria-label="Actions"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className="absolute end-0 z-20 mt-1 w-40 rounded-lg border py-1 shadow-lg"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-color)' }}
          >
            {children}
          </div>
        </>
      ) : null}
    </div>
  );
}
