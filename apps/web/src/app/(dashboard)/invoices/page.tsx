'use client';

import { useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SavedViewsControl } from '@/components/crm/SavedViewsControl';
import { ExportButton } from '@/components/export/ExportButton';
import { formatCurrency, formatDate } from '@/lib/format';
import { notify } from '@/lib/toast';

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
  DRAFT: 'bg-surface-container-high text-on-surface-variant',
  SENT: 'bg-primary-container text-primary',
  PAID: 'bg-success-container text-success',
  VOID: 'bg-surface-container-high text-on-surface-variant line-through',
  OVERDUE: 'bg-error-container text-error',
};

export default function InvoicesPage(): JSX.Element {
  const qc = useQueryClient();
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
      notify.success('Invoice marked as paid');
    },
    onError: () => {
      notify.error('Failed to mark invoice paid');
    },
  });

  const sendInvoice = useMutation({
    mutationFn: (id: string) =>
      apiClients.finance.post(`/invoices/${id}/send`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      notify.success('Invoice sent');
    },
    onError: () => {
      notify.error('Failed to send invoice');
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
          <h1 className="text-xl font-semibold text-on-surface">Invoices</h1>
          <p className="text-sm text-on-surface-variant">{total} total invoices</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="invoices" filters={{ status: statusFilter }} />
          <SavedViewsControl
            entityType="invoice"
            currentFilters={{ status: statusFilter }}
            onApply={(f) => setStatusFilter(typeof f.status === 'string' ? f.status : 'ALL')}
          />
        </div>
      </header>

      {/* Summary metrics */}
      <section className="grid grid-cols-3 gap-4">
        {[
          { label: 'Outstanding', value: formatCurrency(totalOutstanding), color: 'text-warning' },
          { label: 'Collected (this view)', value: formatCurrency(totalPaid), color: 'text-success' },
          { label: 'Total invoices', value: String(total), color: 'text-on-surface' },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-outline-variant bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-on-surface-variant">{m.label}</p>
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
                ? 'bg-inverse-surface text-white'
                : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <section className="overflow-hidden rounded-lg border border-outline-variant bg-surface">
        {invoicesQuery.isLoading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : invoices.length === 0 ? (
          <EmptyState
            icon="🧾"
            title="No invoices found"
            description={
              statusFilter === 'ALL'
                ? 'Invoices generated from accepted quotes and orders will appear here.'
                : `No invoices with status ${statusFilter}. Try a different filter.`
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-start text-xs uppercase tracking-wide text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Due Date</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-surface-container-low">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-on-surface">
                    {inv.invoiceNumber}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-on-surface-variant">
                    {inv.accountId.slice(0, 10)}…
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[inv.status] ?? ''}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-on-surface">
                    {formatCurrency(parseFloat(inv.total), inv.currency)}
                  </td>
                  <td className={`px-4 py-3 text-sm ${inv.status === 'OVERDUE' ? 'font-semibold text-error' : 'text-on-surface-variant'}`}>
                    {inv.dueDate ? formatDate(inv.dueDate) : '—'}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{formatDate(inv.createdAt)}</td>
                  <td className="px-4 py-3 text-end">
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
