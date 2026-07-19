'use client';

import { useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleDollarSign, FileSpreadsheet, Receipt, Wallet } from 'lucide-react';
import { apiClients } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { SavedViewsControl } from '@/components/crm/SavedViewsControl';
import { ExportButton } from '@/components/export/ExportButton';
import {
  CRMEmptyState,
  CRMErrorState,
  CRMFilterPills,
  CRMMetricCard,
  CRMMetricGrid,
  CRMModuleShell,
  CRMPageHeader,
  CRMStatusBadge,
  CRMTableShell,
  CRMToolbar,
} from '@/components/ui/crm';
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

type BadgeTone = 'blue' | 'emerald' | 'amber' | 'orange' | 'rose' | 'slate';

const STATUS_TONES: Record<string, BadgeTone> = {
  DRAFT: 'slate',
  SENT: 'blue',
  PAID: 'emerald',
  VOID: 'slate',
  OVERDUE: 'rose',
};

const STATUS_FILTERS = ['ALL', 'DRAFT', 'SENT', 'PAID', 'OVERDUE', 'VOID'] as const;

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
    <CRMModuleShell className="space-y-6">
      <CRMPageHeader
        eyebrow="Billing"
        icon={Receipt}
        title="Invoices"
        description="Track billing documents from draft through collection, and act on what is outstanding."
        actions={
          <>
            <ExportButton module="invoices" filters={{ status: statusFilter }} />
            <SavedViewsControl
              entityType="invoice"
              currentFilters={{ status: statusFilter }}
              onApply={(f) => setStatusFilter(typeof f.status === 'string' ? f.status : 'ALL')}
            />
          </>
        }
        metrics={
          <CRMMetricGrid>
            <CRMMetricCard
              icon={Wallet}
              label="Outstanding"
              value={formatCurrency(totalOutstanding)}
              note="sent and overdue"
              tone="amber"
            />
            <CRMMetricCard
              icon={CircleDollarSign}
              label="Collected"
              value={formatCurrency(totalPaid)}
              note="in this view"
              tone="emerald"
            />
            <CRMMetricCard
              icon={FileSpreadsheet}
              label="Total invoices"
              value={total}
              note={statusFilter === 'ALL' ? 'all statuses' : `status ${statusFilter}`}
            />
          </CRMMetricGrid>
        }
      />

      <CRMToolbar>
        <CRMFilterPills
          value={statusFilter}
          options={STATUS_FILTERS.map((s) => ({ value: s as string, label: s }))}
          onChange={(value) => setStatusFilter(value)}
        />
      </CRMToolbar>

      <CRMTableShell>
        {invoicesQuery.isLoading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : invoicesQuery.isError ? (
          <div className="p-5">
            <CRMErrorState
              title="Unable to load invoices"
              description="The billing service did not respond. Try again in a moment."
            />
          </div>
        ) : invoices.length === 0 ? (
          <CRMEmptyState
            icon={Receipt}
            title="No invoices found"
            description={
              statusFilter === 'ALL'
                ? 'Invoices generated from accepted quotes and orders will appear here.'
                : `No invoices with status ${statusFilter}. Try a different filter.`
            }
          />
        ) : (
          <table className="w-full min-w-[880px] text-sm">
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
                    <CRMStatusBadge tone={STATUS_TONES[inv.status] ?? 'slate'}>{inv.status}</CRMStatusBadge>
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
      </CRMTableShell>
    </CRMModuleShell>
  );
}
