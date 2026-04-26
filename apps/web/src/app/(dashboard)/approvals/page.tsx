'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';

type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED' | 'CANCELLED';

type ApprovalRequest = {
  id: string;
  module: string;
  recordId: string;
  data?: Record<string, unknown>;
  status: ApprovalStatus;
  createdAt: string;
  requestedBy?: string;
  currentApproverId?: string;
};

type ApprovalListResult = { data: ApprovalRequest[]; total: number; page: number; limit: number };

function statusClass(status: ApprovalStatus): string {
  if (status === 'PENDING' || status === 'ESCALATED') return 'bg-amber-100 text-amber-800';
  if (status === 'APPROVED') return 'bg-emerald-100 text-emerald-800';
  return 'bg-red-100 text-red-700';
}

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'ALL' | ApprovalStatus>('PENDING');

  const inbox = useQuery({
    queryKey: ['approval-inbox', filter],
    queryFn: () =>
      apiClients.workflow.get<ApprovalListResult>('/approval/requests', {
        params: { status: filter === 'ALL' ? undefined : filter, page: 1, limit: 50 },
      }),
  });

  const mine = useQuery({
    queryKey: ['approval-mine'],
    queryFn: () => apiClients.workflow.get<ApprovalListResult>('/approval/requests/mine', { params: { page: 1, limit: 20 } }),
  });

  const approve = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) => apiClients.workflow.post(`/approval/requests/${id}/approve`, { comment }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['approval-inbox'] }),
        qc.invalidateQueries({ queryKey: ['approval-mine'] }),
      ]);
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) => apiClients.workflow.post(`/approval/requests/${id}/reject`, { comment }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['approval-inbox'] }),
        qc.invalidateQueries({ queryKey: ['approval-mine'] }),
      ]);
    },
  });

  const rows = inbox.data?.data ?? [];
  const pendingMine = useMemo(() => (mine.data?.data ?? []).filter((r) => r.status === 'PENDING'), [mine.data]);

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-2xl font-bold text-slate-900">Approval Inbox</h1>
      <div className="flex gap-2">
        {([
          ['PENDING', 'Pending'],
          ['APPROVED', 'Approved'],
          ['REJECTED', 'Rejected'],
          ['ALL', 'All'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded px-3 py-2 text-sm ${filter === value ? 'bg-slate-900 text-white' : 'border border-slate-300'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Module</th>
              <th className="px-3 py-2">Record</th>
              <th className="px-3 py-2">Discount</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Requested</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const data = r.data ?? {};
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{r.module}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.recordId}</td>
                  <td className="px-3 py-2">{Number(data.requestedDiscountPercent ?? 0)}%</td>
                  <td className="px-3 py-2">${Number(data.dealValue ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs ${statusClass(r.status)}`}>{r.status}</span></td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => approve.mutate({ id: r.id, comment: 'Approved from inbox' })} className="rounded border border-emerald-300 px-2 py-1 text-xs" disabled={approve.isPending || r.status !== 'PENDING'}>Approve</button>
                      <button onClick={() => { const note = window.prompt('Reject reason (required)'); if (!note) return; reject.mutate({ id: r.id, comment: note }); }} className="rounded border border-red-300 px-2 py-1 text-xs" disabled={reject.isPending || r.status !== 'PENDING'}>Reject</button>
                      <button onClick={() => { const max = window.prompt('Counter-offer max discount %', '15'); if (!max) return; reject.mutate({ id: r.id, comment: `Counter-offer: ${max}%` }); }} className="rounded border border-slate-300 px-2 py-1 text-xs" disabled={reject.isPending || r.status !== 'PENDING'}>Counter</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? <tr><td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={7}>{inbox.isLoading ? 'Loading...' : 'No approvals found.'}</td></tr> : null}
          </tbody>
        </table>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">My pending approvals</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {pendingMine.map((r) => (
            <li key={`mine-${r.id}`} className="flex items-center justify-between rounded border border-slate-200 p-2">
              <span>{r.module} · reviewer {r.currentApproverId ?? 'TBD'} · waiting since {new Date(r.createdAt).toLocaleDateString()}</span>
              <button className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={() => qc.invalidateQueries({ queryKey: ['approval-mine'] })}>Send reminder</button>
            </li>
          ))}
          {pendingMine.length === 0 ? <li className="text-slate-500">No pending requests.</li> : null}
        </ul>
      </section>
    </main>
  );
}
