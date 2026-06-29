'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';
import { EmptyState } from '@/components/ui/EmptyState';

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
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">RFQs</h1>
      </div>

      <section className="rounded-lg border bg-white p-4">
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 rounded border px-3 py-2 text-sm"
            placeholder="RFQ title"
          />
          <button onClick={() => create.mutate()} className="rounded bg-blue-600 px-3 py-2 text-sm text-white">
            Create RFQ
          </button>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-2">
        <table className="w-full text-sm">
          <thead className="text-start text-xs uppercase text-gray-500">
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
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">{row.rfqNumber}</td>
                <td className="px-3 py-2">{row.title ?? row.name ?? 'Untitled RFQ'}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">{row.currency}</td>
                <td className="px-3 py-2 text-end">
                  <Link href={`/rfqs/${row.id}`} className="rounded border px-2 py-1 text-xs">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {(list.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8">
                  <EmptyState
                    icon="📋"
                    title="No RFQs yet"
                    description="Create your first Request for Quotation to start procurement"
                    cta={{ label: '+ New RFQ', onClick: () => create.mutate() }}
                    compact
                  />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}

