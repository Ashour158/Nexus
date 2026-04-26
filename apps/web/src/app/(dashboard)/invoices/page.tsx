'use client';

import { useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useUiStore } from '@/stores/ui.store';
import { formatCurrency, formatDate } from '@/lib/format';

interface Invoice {
  id: string;
  invoiceNumber: string;
  accountId: string;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'VOID' | 'OVERDUE';
  subtotal: string;
  tax: string;
  total: string;
  currency: string;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SENT: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  VOID: 'bg-slate-100 text-slate-400 line-through',
  OVERDUE: 'bg-red-100 text-red-700',
};

export default function InvoicesPage(): JSX.Element {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const invoicesQuery = useQuery({
    queryKey: ['invoices', statusFilter],
    queryFn: () =>
      apiClients.finance.get<{ data: Invoice[]; total: number }>(
        `/invoices${statusFilter !== 'ALL' ? `?status=${statusFilter}` : ''}`
      ),
  });

  const markPaid = useMutation({
    mutationFn: (id: string) =>
      apiClients.finance.post(`/invoices/${id}/mark-paid`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      pushToast({ variant: 'success', title: 'Invoice marked as paid' });
    },
    onError: () => {
      pushToast({ variant: 'error', title: 'Failed to mark invoice paid' });
    },
  });

  const sendInvoice = useMutation({
    mutationFn: (id: string) =>
      apiClients.finance.post(`/invoices/${id}/send`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      pushToast({ variant: 'success', title: 'Invoice sent' });
    },
    onError: () => {
      pushToast({ variant: 'error', title: 'Failed to send invoice' });
    },
  });

  const invoices = invoicesQuery.data?.data ?? [];
  const total = invoicesQuery.data?.total ?? 0;

  const totalOutstanding = invoices
    .filter((i) => i.status === 'SENT' || i.status === 'OVERDUE')
    .reduce((sum, i) => sum + parseFloat(i.total), 0);

  const totalPaid = invoices
    .filter((i) => i.status === 'PAID')
    .reduce((sum, i) => sum + parseFloat(i.total), 0);

  return (
    <main className="space-y-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500">{total} total invoices</p>
        </div>
      </header>

      {/* Summary metrics */}
      <section className="grid grid-cols-3 gap-4">
        {[
          { label: 'Outstanding', value: formatCurrency(totalOutstanding), color: 'text-orange-600' },
          { label: 'Collected (this view)', value: formatCurrency(totalPaid), color: 'text-emerald-600' },
          { label: 'Total invoices', value: String(total), color: 'text-slate-900' },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{m.label}</p>
            <p className={`mt-1 text-2xl font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </section>

      {/* Filters */}
      <div className="flex gap-2">
        {['ALL', 'DRAFT', 'SENT', 'PAID', 'OVERDUE', 'VOID'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {invoicesQuery.isLoading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No invoices found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">
                    {inv.invoiceNumber}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                    {inv.accountId.slice(0, 10)}…
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[inv.status] ?? ''}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {formatCurrency(parseFloat(inv.total), inv.currency)}
                  </td>
                  <td className={`px-4 py-3 text-sm ${inv.status === 'OVERDUE' ? 'font-semibold text-red-600' : 'text-slate-600'}`}>
                    {inv.dueDate ? formatDate(inv.dueDate) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(inv.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      {inv.status === 'DRAFT' && (
                        <Button
                          variant="secondary"
                          onClick={() => sendInvoice.mutate(inv.id)}
                          disabled={sendInvoice.isPending}
                        >
                          Send
                        </Button>
                      )}
                      {(inv.status === 'SENT' || inv.status === 'OVERDUE') && (
                        <Button
                          variant="primary"
                          onClick={() => markPaid.mutate(inv.id)}
                          disabled={markPaid.isPending}
                        >
                          Mark Paid
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
