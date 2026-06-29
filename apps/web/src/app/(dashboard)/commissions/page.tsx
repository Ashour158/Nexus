'use client';

import { useEffect, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';

interface Commission {
  id: string;
  repId: string;
  repName: string;
  dealId: string;
  dealName: string;
  dealAmount: number;
  rate: number;
  commissionAmount: number;
  status: string;
  paidAt?: string;
  createdAt: string;
}

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/finance/commissions')
      .then((r) => r.json())
      .then((d) => {
        setCommissions(d.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const total = commissions.reduce((s, c) => s + c.commissionAmount, 0);
  const paid = commissions
    .filter((c) => c.status === 'PAID')
    .reduce((s, c) => s + c.commissionAmount, 0);
  const pending = total - paid;
  const fmt = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Commissions</h1>
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs text-gray-500">Total Earned</p><p className="text-xl font-bold text-gray-900">{fmt(total)}</p></div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4"><p className="text-xs text-green-600">Paid</p><p className="text-xl font-bold text-green-700">{fmt(paid)}</p></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs text-amber-600">Pending</p><p className="text-xl font-bold text-amber-700">{fmt(pending)}</p></div>
      </div>
      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />)}</div>
      ) : commissions.length === 0 ? (
        <EmptyState
          icon="💰"
          title="No commissions recorded"
          description="Commissions are calculated when deals are marked as won"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50"><tr>
              <th className="px-4 py-3 text-start font-medium text-gray-500">Rep</th>
              <th className="px-4 py-3 text-start font-medium text-gray-500">Deal</th>
              <th className="px-4 py-3 text-end font-medium text-gray-500">Deal Value</th>
              <th className="px-4 py-3 text-end font-medium text-gray-500">Rate</th>
              <th className="px-4 py-3 text-end font-medium text-gray-500">Commission</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {commissions.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.repName}</td>
                  <td className="px-4 py-3 text-gray-600">{c.dealName}</td>
                  <td className="px-4 py-3 text-end text-gray-700">{fmt(c.dealAmount)}</td>
                  <td className="px-4 py-3 text-end text-gray-500">{c.rate}%</td>
                  <td className="px-4 py-3 text-end font-semibold text-gray-900">{fmt(c.commissionAmount)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
