'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { notify } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';

interface NumberConfig {
  prefix: string;
  separator: string;
  includeYear: boolean;
  padding: number;
  resetYearly: boolean;
  nextSequence: number;
}
interface ApprovalTier {
  id: string;
  name: string;
  level: number;
  minAmount: string | null;
  minDiscountPercent: string | null;
  approverRole: string | null;
  isActive: boolean;
}

export default function QuoteSettingsPage() {
  const qc = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const roles = useAuthStore((s) => s.roles);
  const isAdmin = roles.some((r) => r.toLowerCase() === 'admin') || hasPermission('settings:update');

  const cfgQuery = useQuery<{ data: NumberConfig }>({
    queryKey: ['quote-number-config'],
    queryFn: () => api.get<{ data: NumberConfig }>('/finance/quotes/config/numbering'),
  });
  const tiersQuery = useQuery<{ data: ApprovalTier[] }>({
    queryKey: ['quote-approval-tiers'],
    queryFn: () => api.get<{ data: ApprovalTier[] }>('/finance/quotes/config/approval-tiers'),
  });

  const [cfg, setCfg] = useState<NumberConfig | null>(null);
  useEffect(() => {
    if (cfgQuery.data?.data) setCfg(cfgQuery.data.data);
  }, [cfgQuery.data]);

  const saveCfg = useMutation({
    mutationFn: (body: Partial<NumberConfig>) => api.put('/finance/quotes/config/numbering', body),
    onSuccess: () => {
      notify.success('Numbering saved');
      qc.invalidateQueries({ queryKey: ['quote-number-config'] });
    },
    onError: (e: Error) => notify.error('Save failed', e.message),
  });

  const [tierForm, setTierForm] = useState({ name: '', level: 1, minAmount: '', minDiscountPercent: '' });
  const addTier = useMutation({
    mutationFn: () =>
      api.post('/finance/quotes/config/approval-tiers', {
        name: tierForm.name,
        level: Number(tierForm.level),
        minAmount: tierForm.minAmount ? Number(tierForm.minAmount) : undefined,
        minDiscountPercent: tierForm.minDiscountPercent ? Number(tierForm.minDiscountPercent) : undefined,
      }),
    onSuccess: () => {
      notify.success('Approval tier added');
      setTierForm({ name: '', level: 1, minAmount: '', minDiscountPercent: '' });
      qc.invalidateQueries({ queryKey: ['quote-approval-tiers'] });
    },
    onError: (e: Error) => notify.error('Add failed', e.message),
  });
  const delTier = useMutation({
    mutationFn: (id: string) => api.delete(`/finance/quotes/config/approval-tiers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quote-approval-tiers'] }),
  });

  if (!isAdmin) {
    return (
      <main className="px-6 py-8">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Quote administration is restricted to admins.
        </div>
      </main>
    );
  }

  const preview = cfg
    ? [cfg.prefix, cfg.includeYear ? new Date().getFullYear() : null, '1'.padStart(Math.max(1, cfg.padding), '0')]
        .filter((x) => x !== null)
        .join(cfg.separator)
    : '…';

  return (
    <main className="space-y-6 px-6 py-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Quote administration</h1>
        <p className="text-sm text-slate-600">Control quote numbering and multi-level approval thresholds.</p>
      </header>

      {/* Numbering */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-900">Auto-numbering</h2>
        <p className="mt-1 text-xs text-slate-500">Next quote will be numbered <span className="font-mono font-semibold text-blue-700">{preview}</span>.</p>
        {cfg ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Prefix
              <Input value={cfg.prefix} onChange={(e) => setCfg({ ...cfg, prefix: e.target.value })} />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Separator
              <Input value={cfg.separator} onChange={(e) => setCfg({ ...cfg, separator: e.target.value })} />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Padding (digits)
              <Input type="number" min={1} max={10} value={cfg.padding} onChange={(e) => setCfg({ ...cfg, padding: Number(e.target.value) })} />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Next sequence
              <Input type="number" min={1} value={cfg.nextSequence} onChange={(e) => setCfg({ ...cfg, nextSequence: Number(e.target.value) })} />
            </label>
            <label className="flex items-center gap-2 self-end text-sm text-slate-700">
              <input type="checkbox" checked={cfg.includeYear} onChange={(e) => setCfg({ ...cfg, includeYear: e.target.checked })} />
              Include year
            </label>
            <label className="flex items-center gap-2 self-end text-sm text-slate-700">
              <input type="checkbox" checked={cfg.resetYearly} onChange={(e) => setCfg({ ...cfg, resetYearly: e.target.checked })} />
              Reset yearly
            </label>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Loading…</p>
        )}
        <div className="mt-4">
          <Button onClick={() => cfg && saveCfg.mutate(cfg)} isLoading={saveCfg.isPending} disabled={!cfg}>
            Save numbering
          </Button>
        </div>
      </section>

      {/* Approval tiers */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-900">Approval thresholds</h2>
        <p className="mt-1 text-xs text-slate-500">A quote needs the highest level of any tier whose amount / discount % it crosses.</p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-start">Name</th>
                <th className="px-3 py-2 text-center">Level</th>
                <th className="px-3 py-2 text-end">Min amount</th>
                <th className="px-3 py-2 text-end">Min discount %</th>
                <th className="px-3 py-2 text-end"> </th>
              </tr>
            </thead>
            <tbody>
              {(tiersQuery.data?.data ?? []).map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2 text-center">L{t.level}</td>
                  <td className="px-3 py-2 text-end">{t.minAmount ? Number(t.minAmount).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-end">{t.minDiscountPercent ? `${Number(t.minDiscountPercent)}%` : '—'}</td>
                  <td className="px-3 py-2 text-end">
                    <Button variant="destructive" onClick={() => delTier.mutate(t.id)}>Remove</Button>
                  </td>
                </tr>
              ))}
              {(tiersQuery.data?.data ?? []).length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No approval tiers — quotes need no approval.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <Input placeholder="Tier name" value={tierForm.name} onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })} />
          <Input type="number" min={1} placeholder="Level" value={tierForm.level} onChange={(e) => setTierForm({ ...tierForm, level: Number(e.target.value) })} />
          <Input type="number" min={0} placeholder="Min amount" value={tierForm.minAmount} onChange={(e) => setTierForm({ ...tierForm, minAmount: e.target.value })} />
          <Input type="number" min={0} max={100} placeholder="Min discount %" value={tierForm.minDiscountPercent} onChange={(e) => setTierForm({ ...tierForm, minDiscountPercent: e.target.value })} />
          <Button onClick={() => addTier.mutate()} isLoading={addTier.isPending} disabled={!tierForm.name || (!tierForm.minAmount && !tierForm.minDiscountPercent)}>
            Add tier
          </Button>
        </div>
      </section>
    </main>
  );
}
