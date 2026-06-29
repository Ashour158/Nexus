'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';
import { formatDateTime } from '@/lib/format';
import { Trash2, RefreshCw, AlertTriangle } from 'lucide-react';

interface RecycleItem {
  id: string;
  module: string;
  recordId: string;
  recordSnapshot: Record<string, unknown>;
  deletedBy: string;
  deletedAt: string;
  expiresAt: string;
}

export default function RecycleBinPage() {
  const [moduleFilter, setModuleFilter] = useState<string>('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['recycle-bin', moduleFilter],
    queryFn: () =>
      apiClients.data.get<{ data: RecycleItem[]; total: number }>(
        '/recycle',
        { params: { module: moduleFilter || undefined, page: 1, limit: 100 } }
      ),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiClients.data.post(`/recycle/${id}/restore`, {}),
    onSuccess: () => {
      notify.success('Item restored');
      queryClient.invalidateQueries({ queryKey: ['recycle-bin'] });
    },
    onError: (err: Error) => notify.error('Restore failed', err.message),
  });

  const purgeMutation = useMutation({
    mutationFn: (id: string) => apiClients.data.delete(`/recycle/${id}`),
    onSuccess: () => {
      notify.success('Item permanently deleted');
      queryClient.invalidateQueries({ queryKey: ['recycle-bin'] });
    },
    onError: (err: Error) => notify.error('Delete failed', err.message),
  });

  const items = data?.data ?? [];

  return (
    <main className="space-y-4 px-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Recycle Bin</h1>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <AlertTriangle className="h-4 w-4" />
          Items are permanently deleted after 30 days
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setModuleFilter('')}
          className={`rounded-md px-3 py-1.5 text-sm ${!moduleFilter ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}
        >
          All
        </button>
        {['leads', 'contacts', 'accounts', 'deals'].map((m) => (
          <button
            key={m}
            onClick={() => setModuleFilter(m)}
            className={`rounded-md px-3 py-1.5 text-sm capitalize ${moduleFilter === m ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}
          >
            {m}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <Trash2 className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">Recycle bin is empty</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Record</th>
                <th className="px-4 py-3">Deleted By</th>
                <th className="px-4 py-3">Deleted At</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 capitalize">{item.module}</td>
                  <td className="px-4 py-3">
                    {(item.recordSnapshot.name as string) ??
                      (item.recordSnapshot.firstName as string)
                        ? `${item.recordSnapshot.firstName} ${item.recordSnapshot.lastName}`
                        : item.recordId}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{item.deletedBy.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(item.deletedAt)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(item.expiresAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => restoreMutation.mutate(item.id)}
                        disabled={restoreMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                        title="Restore"
                      >
                        <RefreshCw className="h-3 w-3" /> Restore
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('Permanently delete this item?')) {
                            purgeMutation.mutate(item.id);
                          }
                        }}
                        disabled={purgeMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        title="Delete forever"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
