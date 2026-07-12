'use client';

import { useMemo, useState, type JSX } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useUiStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { formatCurrency, formatDate } from '@/lib/format';
import SendForSignature from '@/components/esign/SendForSignature';
import { ExportButton } from '@/components/export/ExportButton';

interface Contract {
  id: string;
  name: string;
  accountId: string;
  status: 'DRAFT' | 'PENDING_SIGNATURE' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'RENEWED';
  totalValue: string;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

const statusStyles: Record<Contract['status'], string> = {
  DRAFT: 'bg-surface-container-high text-on-surface',
  PENDING_SIGNATURE: 'bg-primary-container text-primary',
  ACTIVE: 'bg-success-container text-success',
  EXPIRED: 'bg-surface-container-high text-on-surface-variant',
  TERMINATED: 'bg-error-container text-error',
  RENEWED: 'bg-tertiary-container text-tertiary',
};

interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function ContractsPage(): JSX.Element {
  const qc = useQueryClient();
  const toast = useUiStore((s) => s.pushToast);
  const userId = useAuthStore((s) => s.userId);
  const [status, setStatus] = useState<'ALL' | Contract['status']>('ALL');
  const [form, setForm] = useState({
    name: '',
    accountId: '',
    ownerId: userId ?? '',
    totalValue: '',
    currency: 'USD',
    startDate: '',
    endDate: '',
  });
  const query = useQuery({
    queryKey: ['contracts', status],
    queryFn: () =>
      apiClients.finance.get<Paginated<Contract>>('/contracts', {
        params: { status: status !== 'ALL' ? status : undefined, page: 1, limit: 100 },
      }),
  });
  const create = useMutation({
    mutationFn: () =>
      apiClients.finance.post('/contracts', {
        name: form.name,
        accountId: form.accountId,
        ownerId: form.ownerId,
        totalValue: Number(form.totalValue),
        currency: form.currency || 'USD',
        startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
        autoRenew: false,
        renewalTermDays: 30,
        lineItems: [],
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['contracts'] });
      setForm({
        name: '',
        accountId: '',
        ownerId: userId ?? '',
        totalValue: '',
        currency: 'USD',
        startDate: '',
        endDate: '',
      });
      toast({ variant: 'success', title: 'Contract created' });
    },
    onError: (err) => toast({ variant: 'error', title: 'Failed to create contract', description: err instanceof Error ? err.message : 'Unknown error' }),
  });
  const sign = useMutation({
    mutationFn: (id: string) => {
      if (!userId) throw new Error('Missing user id');
      return apiClients.finance.post(`/contracts/${id}/sign`, { signedById: userId });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['contracts'] });
      toast({ variant: 'success', title: 'Contract signed' });
    },
  });

  const contracts = useMemo(() => query.data?.data ?? [], [query.data]);
  const activeContracts = contracts.filter((c) => c.status === 'ACTIVE');
  const totalValue = activeContracts.reduce(
    (sum, contract) => sum + Number(contract.totalValue),
    0
  );
  const expiringSoon = activeContracts.filter((contract) => {
    if (!contract.endDate) return false;
    const days = (new Date(contract.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 30;
  }).length;

  return (
    <main className="space-y-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Contracts</h1>
          <p className="text-sm text-on-surface-variant">Track lifecycle and signatures for customer contracts.</p>
        </div>
        <ExportButton module="contracts" />
      </header>

      <section className="rounded-lg border border-outline-variant bg-surface p-4">
        <h2 className="mb-3 font-medium text-on-surface">Create contract</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Input placeholder="Title" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Input placeholder="Account ID" value={form.accountId} onChange={(e) => setForm((p) => ({ ...p, accountId: e.target.value }))} />
          <Input placeholder="Owner ID" value={form.ownerId} onChange={(e) => setForm((p) => ({ ...p, ownerId: e.target.value }))} />
          <Input placeholder="Value" type="number" value={form.totalValue} onChange={(e) => setForm((p) => ({ ...p, totalValue: e.target.value }))} />
          <Input placeholder="Currency" value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} />
          <Input type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
          <Input type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
        </div>
        <div className="mt-3">
          <Button onClick={() => create.mutate()} disabled={create.isPending}>Create</Button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-outline-variant bg-surface p-4"><p className="text-xs uppercase text-on-surface-variant">Active Contracts</p><p className="text-2xl font-bold text-on-surface">{activeContracts.length}</p></div>
        <div className="rounded-lg border border-outline-variant bg-surface p-4"><p className="text-xs uppercase text-on-surface-variant">Total Value</p><p className="text-2xl font-bold text-success">{formatCurrency(totalValue)}</p></div>
        <div className="rounded-lg border border-outline-variant bg-surface p-4"><p className="text-xs uppercase text-on-surface-variant">Expiring Soon</p><p className="text-2xl font-bold text-warning">{expiringSoon}</p></div>
      </section>

      <div className="flex flex-wrap gap-2">
        {['ALL', 'DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED'].map((value) => (
          <button key={value} type="button" onClick={() => setStatus(value as 'ALL' | Contract['status'])} className={`rounded-full px-3 py-1 text-xs font-medium ${status === value ? 'bg-inverse-surface text-white' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'}`}>{value}</button>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-outline-variant bg-surface">
        {query.isLoading ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : contracts.length === 0 ? (
          <EmptyState
            icon="📄"
            title="No contracts found"
            description={
              status === 'ALL'
                ? 'Create a contract above to track its lifecycle and signatures.'
                : `No contracts with status ${status}. Try a different filter.`
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-start text-xs uppercase text-on-surface-variant">
              <tr><th className="px-3 py-2">Title</th><th>Account</th><th>Status</th><th>Value</th><th>Start Date</th><th>End Date</th><th className="pe-3 text-end">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {contracts.map((contract) => (
                <tr key={contract.id}>
                  <td className="px-3 py-2 font-medium">{contract.name}</td>
                  <td className="font-mono text-xs">{contract.accountId}</td>
                  <td><span className={`rounded-full px-2 py-0.5 text-xs ${statusStyles[contract.status]}`}>{contract.status}</span></td>
                  <td>{contract.currency} {formatCurrency(Number(contract.totalValue))}</td>
                  <td>{contract.startDate ? formatDate(contract.startDate) : '—'}</td>
                  <td>{contract.endDate ? formatDate(contract.endDate) : '—'}</td>
                  <td className="space-y-2 pe-3 text-end">
                    {contract.status === 'DRAFT' ? <Button variant="secondary" onClick={() => sign.mutate(contract.id)} disabled={sign.isPending}>Sign</Button> : null}
                    <SendForSignature contractId={contract.id} documentName={contract.name} />
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
