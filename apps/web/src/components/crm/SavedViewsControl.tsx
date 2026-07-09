'use client';

import { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, ChevronDown, Plus, Trash2, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  useCreateSavedView,
  useDeleteSavedView,
  useSavedViews,
  type SavedView,
  type SavedViewEntityType,
} from '@/hooks/use-saved-views';

/**
 * Small, unobtrusive "Views" control for list-page headers.
 *
 * - Lists saved views (GET /saved-views).
 * - Saves the page's current filter state (POST /saved-views).
 * - Applies a view by loading its filters back into page state (onApply).
 * - Deletes a view (DELETE /saved-views/:id).
 *
 * Endpoints may 404 until the backend deploys; the list degrades to empty.
 */
export function SavedViewsControl({
  entityType,
  currentFilters,
  onApply,
}: {
  entityType: SavedViewEntityType;
  currentFilters: Record<string, unknown>;
  onApply: (filters: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [isShared, setIsShared] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const viewsQuery = useSavedViews(entityType);
  const createView = useCreateSavedView();
  const deleteView = useDeleteSavedView();
  const views = viewsQuery.data ?? [];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSaving(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createView.mutate(
      { entityType, name: trimmed, filters: currentFilters, isShared },
      {
        onSuccess: () => {
          setName('');
          setIsShared(false);
          setSaving(false);
        },
      }
    );
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
      >
        <Bookmark className="h-3.5 w-3.5" />
        Views
        {views.length > 0 ? (
          <span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">
            {views.length}
          </span>
        ) : null}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="max-h-64 overflow-y-auto p-1">
            {viewsQuery.isLoading ? (
              <p className="px-3 py-4 text-center text-xs text-slate-400">Loading views…</p>
            ) : views.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-slate-400">
                No saved views yet.
              </p>
            ) : (
              views.map((view) => (
                <ViewRow
                  key={view.id}
                  view={view}
                  onApply={() => {
                    onApply(view.filters ?? {});
                    setOpen(false);
                  }}
                  onDelete={() => deleteView.mutate({ id: view.id, entityType })}
                  deleting={deleteView.isPending}
                />
              ))
            )}
          </div>

          <div className="border-t border-slate-100 p-2">
            {saving ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                    if (e.key === 'Escape') setSaving(false);
                  }}
                  placeholder="View name…"
                  className="h-9 w-full rounded-md border border-slate-200 px-2.5 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
                <label className="flex items-center gap-2 px-0.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={isShared}
                    onChange={(e) => setIsShared(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <Users className="h-3.5 w-3.5" />
                  Share with team
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!name.trim() || createView.isPending}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-blue-600 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {createView.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaving(false)}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSaving(true)}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Save current view
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ViewRow({
  view,
  onApply,
  onDelete,
  deleting,
}: {
  view: SavedView;
  onApply: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="group flex items-center gap-1 rounded-md px-1 hover:bg-slate-50">
      <button
        type="button"
        onClick={onApply}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm text-slate-700"
      >
        <Bookmark className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="truncate">{view.name}</span>
        {view.isShared ? (
          <Users className="h-3 w-3 shrink-0 text-slate-400" aria-label="Shared" />
        ) : null}
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label={`Delete view ${view.name}`}
        className={cn(
          'shrink-0 rounded p-1.5 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100',
          deleting && 'opacity-100'
        )}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
