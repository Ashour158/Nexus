'use client';

import { useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CircleDollarSign, Repeat, TrendingUp } from 'lucide-react';
import { apiClients } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
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

interface Subscription {
  id: string;
  accountId: string;
  planName: string;
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED';
  quantity: number;
  unitPrice: string;
  currency: string;
  billingPeriod: string;
  startDate: string;
  nextBillingDate: string | null;
  cancelledAt: string | null;
  mrr: string;
  arr: string;
  contract?: { id: string; contractNumber: string; name: string } | null;
}

interface SubscriptionListResponse {
  data: {
    items: Subscription[];
    total: number;
    summary: { activeCount: number; mrr: string | number; arr: string | number };
  };
}

type BadgeTone = 'blue' | 'emerald' | 'amber' | 'orange' | 'rose' | 'slate';

const STATUS_TONES: Record<string, BadgeTone> = {
  TRIALING: 'blue',
  ACTIVE: 'emerald',
  PAST_DUE: 'orange',
  PAUSED: 'amber',
  CANCELLED: 'slate',
  EXPIRED: 'slate',
};

const STATUS_FILTERS = ['ALL', 'ACTIVE', 'TRIALING', 'PAST_DUE', 'PAUSED', 'CANCELLED'] as const;

export default function BillingPage(): JSX.Element {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const subsQuery = useQuery({
    queryKey: ['subscriptions', statusFilter],
    queryFn: () =>
      apiClients.finance.get<SubscriptionListResponse>(
        `/subscriptions${statusFilter !== 'ALL' ? `?status=${statusFilter}` : ''}`
      ),
  });

  const cancelSub = useMutation({
    mutationFn: (id: string) =>
      apiClients.finance.post(`/subscriptions/${id}/cancel`, {
        reason: 'Cancelled from billing page',
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['subscriptions'] });
      notify.success('Subscription cancelled');
    },
    onError: () => {
      notify.error('Failed to cancel subscription');
    },
  });

  const payload = subsQuery.data?.data;
  const rows = payload?.items ?? [];
  const summary = payload?.summary;
  const upcomingRenewals = rows.filter(
    (s) => s.nextBillingDate && s.status === 'ACTIVE'
  ).length;

  return (
    <CRMModuleShell className="space-y-6">
      <CRMPageHeader
        eyebrow="Billing"
        icon={Repeat}
        title="Subscriptions"
        description="Recurring revenue created when contracts activate — the engine behind scheduled invoices."
        metrics={
          <CRMMetricGrid>
            <CRMMetricCard
              icon={Repeat}
              label="Active subscriptions"
              value={summary ? String(summary.activeCount) : '—'}
              note="active, trialing, past-due"
            />
            <CRMMetricCard
              icon={CircleDollarSign}
              label="MRR"
              value={summary ? formatCurrency(Number(summary.mrr)) : '—'}
              note="monthly recurring"
              tone="emerald"
            />
            <CRMMetricCard
              icon={TrendingUp}
              label="ARR"
              value={summary ? formatCurrency(Number(summary.arr)) : '—'}
              note="annualized"
            />
            <CRMMetricCard
              icon={CalendarClock}
              label="Upcoming renewals"
              value={String(upcomingRenewals)}
              note="in this view"
              tone="amber"
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
        {subsQuery.isLoading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : subsQuery.isError ? (
          <div className="p-5">
            <CRMErrorState
              title="Unable to load subscriptions"
              description="The billing service did not respond. Try again in a moment."
            />
          </div>
        ) : rows.length === 0 ? (
          <CRMEmptyState
            icon={Repeat}
            title="No subscriptions found"
            description={
              statusFilter === 'ALL'
                ? 'Subscriptions are created automatically when a contract with recurring line items is activated.'
                : `No subscriptions with status ${statusFilter}. Try a different filter.`
            }
          />
        ) : (
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-surface-container-low text-start text-xs uppercase tracking-wide text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Contract</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Unit Price</th>
                <th className="px-4 py-3">MRR</th>
                <th className="px-4 py-3">Billing</th>
                <th className="px-4 py-3">Next Billing</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-surface-container-low">
                  <td className="px-4 py-3 font-medium text-on-surface">{s.planName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">
                    {s.contract ? s.contract.contractNumber : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <CRMStatusBadge tone={STATUS_TONES[s.status] ?? 'slate'}>
                      {s.status}
                    </CRMStatusBadge>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{s.quantity}</td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {formatCurrency(parseFloat(s.unitPrice), s.currency)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-on-surface">
                    {formatCurrency(parseFloat(s.mrr), s.currency)}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{s.billingPeriod}</td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {s.nextBillingDate ? formatDate(s.nextBillingDate) : '—'}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {s.status !== 'CANCELLED' && s.status !== 'EXPIRED' && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (window.confirm(`Cancel subscription "${s.planName}"?`)) {
                            cancelSub.mutate(s.id);
                          }
                        }}
                        disabled={cancelSub.isPending}
                      >
                        Cancel
                      </Button>
                    )}
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
