'use client';

import { useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { notify } from '@/lib/toast';
import { apiClients } from '@/lib/api-client';

interface SavedView {
  id: string;
  name: string;
  filters?: Record<string, unknown>;
  columns?: string[];
  sortBy?: string | null;
  sortDir?: 'asc' | 'desc';
  isDefault?: boolean;
}

export function SavedViewsSidebar({
  module,
  onViewSelect,
  currentFilters,
  currentSortBy,
  currentSortDir,
  currentColumns,
}: {
  module: string;
  onViewSelect: (payload: {
    filters?: Record<string, unknown>;
    columns?: string[];
    sortBy?: string | null;
    sortDir?: 'asc' | 'desc';
  }) => void;
  currentFilters?: Record<string, unknown>;
  currentSortBy?: string;
  currentSortDir?: 'asc' | 'desc';
  currentColumns?: string[];
}): JSX.Element {
  const [open, setOpen] = useState(true);
  const [newName, setNewName] = useState('');

  const views = useQuery({
    queryKey: ['saved-views', module],
    queryFn: async () => {
      if (process.env.NODE_ENV === 'development') {
        const raw = window.localStorage.getItem(`nexus:saved-views:${module}`);
        return raw ? (JSON.parse(raw) as SavedView[]) : [];
      }
      const res = await apiClients.data.get<{ data: SavedView[] }>(`/views/${module}`);
      return res.data;
    },
    retry: false,
  });

  async function saveCurrentView(): Promise<void> {
    if (!newName.trim()) return;
    try {
      if (process.env.NODE_ENV === 'development') {
        const next: SavedView = {
          id: `view-${Date.now()}`,
          name: newName.trim(),
          filters: currentFilters ?? {},
          sortBy: currentSortBy ?? null,
          sortDir: currentSortDir ?? 'desc',
          columns: currentColumns ?? [],
        };
        window.localStorage.setItem(
          `nexus:saved-views:${module}`,
          JSON.stringify([...(views.data ?? []), next])
        );
        setNewName('');
        await views.refetch();
        notify.success('View saved');
        return;
      }
      await apiClients.data.post(`/views/${module}`, {
        name: newName.trim(),
        filters: currentFilters ?? {},
        sortBy: currentSortBy ?? null,
        sortDir: currentSortDir ?? 'desc',
        columns: currentColumns ?? [],
      });
      setNewName('');
      await views.refetch();
      notify.success('View saved');
    } catch (err) {
      notify.error('Save failed', err instanceof Error ? err.message : 'Unknown');
    }
  }

  async function deleteView(id: string): Promise<void> {
    try {
      if (process.env.NODE_ENV === 'development') {
        window.localStorage.setItem(
          `nexus:saved-views:${module}`,
          JSON.stringify((views.data ?? []).filter((view) => view.id !== id))
        );
        await views.refetch();
        notify.success('View deleted');
        return;
      }
      await apiClients.data.delete(`/views/${id}`);
      await views.refetch();
      notify.success('View deleted');
    } catch (err) {
      notify.error('Delete failed', err instanceof Error ? err.message : 'Unknown');
    }
  }

  return (
    <aside className="w-full rounded-lg border border-outline-variant bg-surface p-3 lg:w-64">
      <button className="w-full text-left text-sm font-semibold" onClick={() => setOpen((s) => !s)}>
        Saved Views
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          <button
            className="w-full rounded border border-outline-variant px-2 py-1 text-left text-sm"
            onClick={() => onViewSelect({ filters: {} })}
          >
            All {module}
          </button>
          {(views.data ?? []).map((v) => (
            <div key={v.id} className="flex items-center gap-1">
              <button
                className="flex-1 rounded border border-outline-variant px-2 py-1 text-left text-sm"
                onClick={() =>
                  onViewSelect({
                    filters: v.filters,
                    columns: v.columns,
                    sortBy: v.sortBy,
                    sortDir: v.sortDir,
                  })
                }
              >
                {v.name} {v.isDefault ? '★' : ''}
              </button>
              <button
                onClick={() => void deleteView(v.id)}
                className="rounded p-1 text-on-surface-variant hover:text-error"
                title="Delete view"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <input
            className="h-8 w-full rounded border border-outline-variant px-2 text-sm"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="View name"
          />
          <button
            className="w-full rounded bg-primary px-2 py-1 text-sm text-on-primary"
            onClick={() => void saveCurrentView()}
          >
            Save current view
          </button>
        </div>
      ) : null}
    </aside>
  );
}
