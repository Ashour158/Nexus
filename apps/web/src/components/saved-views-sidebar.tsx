'use client';

import { useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';

interface SavedView {
  id: string;
  name: string;
  filters?: Record<string, unknown>;
  columns?: string[];
  sortBy?: string | null;
  sortDir?: 'asc' | 'desc';
}

export function SavedViewsSidebar({
  module,
  onViewSelect,
}: {
  module: string;
  onViewSelect: (payload: {
    filters?: Record<string, unknown>;
    columns?: string[];
    sortBy?: string | null;
    sortDir?: 'asc' | 'desc';
  }) => void;
}): JSX.Element {
  const [open, setOpen] = useState(true);
  const [newName, setNewName] = useState('');
  const views = useQuery({
    queryKey: ['saved-views', module],
    queryFn: async () => {
      const base = process.env.NEXT_PUBLIC_DATA_URL ?? 'http://localhost:3015';
      const res = await fetch(`${base}/api/v1/views/${module}`);
      if (!res.ok) return [] as SavedView[];
      const body = (await res.json()) as { data: SavedView[] };
      return body.data;
    },
  });

  async function saveCurrentView(): Promise<void> {
    if (!newName.trim()) return;
    const base = process.env.NEXT_PUBLIC_DATA_URL ?? 'http://localhost:3015';
    await fetch(`${base}/api/v1/views/${module}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), filters: {} }),
    });
    setNewName('');
    await views.refetch();
  }

  return (
    <aside className="w-full rounded-lg border border-slate-200 bg-white p-3 lg:w-64">
      <button className="w-full text-left text-sm font-semibold" onClick={() => setOpen((s) => !s)}>
        Saved Views
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          <button className="w-full rounded border border-slate-200 px-2 py-1 text-left text-sm" onClick={() => onViewSelect({ filters: {} })}>All {module}</button>
          {(views.data ?? []).map((v) => (
            <button key={v.id} className="w-full rounded border border-slate-200 px-2 py-1 text-left text-sm" onClick={() => onViewSelect({ filters: v.filters, columns: v.columns, sortBy: v.sortBy, sortDir: v.sortDir })}>
              {v.name}
            </button>
          ))}
          <input className="h-8 w-full rounded border border-slate-200 px-2 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="View name" />
          <button className="w-full rounded bg-slate-900 px-2 py-1 text-sm text-white" onClick={() => void saveCurrentView()}>Save current view</button>
        </div>
      ) : null}
    </aside>
  );
}
