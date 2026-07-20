'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { useConfirm } from '@/hooks/use-confirm';
import { notify } from '@/lib/toast';
import { formatDateTime } from '@/lib/format';
import { Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  CRMEmptyState,
  CRMFilterPills,
  CRMModuleShell,
  CRMPageHeader,
  CRMTableShell,
  CRMToolbar,
} from '@/components/ui/crm';

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
  const { confirm, ConfirmDialog } = useConfirm();

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
    <CRMModuleShell>
      <CRMPageHeader
        icon={Trash2}
        title="Recycle Bin"
        badges={<div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <AlertTriangle className="h-4 w-4" />
          Items are permanently deleted after 30 days
        </div>}
      />

      <CRMToolbar>
        <CRMFilterPills
          value={moduleFilter}
          onChange={setModuleFilter}
          options={[
            { value: '', label: 'All' },
            ...['leads', 'contacts', 'accounts', 'deals'].map((value) => ({
              value,
              label: value.charAt(0).toUpperCase() + value.slice(1),
            })),
          ]}
        />
      </CRMToolbar>

      {isLoading ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : items.length === 0 ? (
        <CRMEmptyState icon={Trash2} title="Recycle bin is empty" />
      ) : (
        <CRMTableShell>
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-left text-xs uppercase text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Record</th>
                <th className="px-4 py-3">Deleted By</th>
                <th className="px-4 py-3">Deleted At</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-surface-container-low">
                  <td className="px-4 py-3 capitalize">{item.module}</td>
                  <td className="px-4 py-3">
                    {(item.recordSnapshot.name as string) ??
                      (item.recordSnapshot.firstName as string)
                        ? `${item.recordSnapshot.firstName} ${item.recordSnapshot.lastName}`
                        : item.recordId}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{item.deletedBy.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{formatDateTime(item.deletedAt)}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{formatDateTime(item.expiresAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => restoreMutation.mutate(item.id)}
                        disabled={restoreMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-md border border-outline-variant bg-surface px-2 py-1 text-xs hover:bg-surface-container-low"
                        title="Restore"
                      >
                        <RefreshCw className="h-3 w-3" /> Restore
                      </button>
                      <button
                        onClick={async () => {
                          if (await confirm('Permanently delete this item?', 'Delete Permanently')) {
                            purgeMutation.mutate(item.id);
                          }
                        }}
                        disabled={purgeMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-md border border-error/30 bg-surface px-2 py-1 text-xs text-error hover:bg-error-container"
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
        </CRMTableShell>
      )}
      {ConfirmDialog}
    </CRMModuleShell>
  );
}
