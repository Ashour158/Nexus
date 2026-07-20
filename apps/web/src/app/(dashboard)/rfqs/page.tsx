'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';
import { ExportButton } from '@/components/export/ExportButton';
import { ClipboardList } from 'lucide-react';
import {
  CRMCard,
  CRMEmptyState,
  CRMModuleShell,
  CRMPageHeader,
  CRMStatusBadge,
  CRMTableShell,
} from '@/components/ui/crm';

type RFQ = {
  id: string;
  rfqNumber: string;
  title: string;
  name?: string;
  status: string;
  currency: string;
  createdAt: string;
};

export default function RFQsPage(): JSX.Element {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const [title, setTitle] = useState('');

  const list = useQuery({
    queryKey: ['rfqs'],
    queryFn: async () => {
      const res = await fetch('/api/finance/rfqs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return (json.data?.data ?? json.data ?? []) as RFQ[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/finance/rfqs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, name: title }),
      });
      return res.json();
    },
    onSuccess: (json) => {
      if (json.success) {
        notify.success('RFQ created');
        setTitle('');
        qc.invalidateQueries({ queryKey: ['rfqs'] });
      } else notify.error('Create failed', json.error);
    },
  });

  return (
    <CRMModuleShell>
      <CRMPageHeader
        icon={ClipboardList}
        title="RFQs"
        actions={<ExportButton module="rfqs" />}
      />

      <CRMCard>
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 rounded border border-outline-variant px-3 py-2 text-sm"
            placeholder="RFQ title"
          />
          <button onClick={() => create.mutate()} className="rounded bg-primary px-3 py-2 text-sm text-on-primary">
            Create RFQ
          </button>
        </div>
      </CRMCard>

      <CRMTableShell>
        <table className="w-full text-sm">
          <thead className="text-start text-xs uppercase text-on-surface-variant">
            <tr>
              <th className="px-3 py-2">RFQ #</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Currency</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((row) => (
              <tr key={row.id} className="border-t border-outline-variant">
                <td className="px-3 py-2">{row.rfqNumber}</td>
                <td className="px-3 py-2">{row.title ?? row.name ?? 'Untitled RFQ'}</td>
                <td className="px-3 py-2"><CRMStatusBadge>{row.status}</CRMStatusBadge></td>
                <td className="px-3 py-2">{row.currency}</td>
                <td className="px-3 py-2 text-end">
                  <Link href={`/rfqs/${row.id}`} className="rounded border border-outline-variant px-2 py-1 text-xs">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {(list.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8">
                  <CRMEmptyState
                    icon={ClipboardList}
                    title="No RFQs yet"
                    description="Create your first Request for Quotation to start procurement"
                    action={(
                      <button
                        onClick={() => create.mutate()}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary/90"
                      >
                        + New RFQ
                      </button>
                    )}
                  />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </CRMTableShell>
    </CRMModuleShell>
  );
}

