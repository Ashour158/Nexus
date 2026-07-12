'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';

type TaxZone = { id: string; name: string; country?: string | null };
type TaxRate = { id: string; zoneId: string; name: string; code: string; rate: number };

export default function TaxSettingsPage(): JSX.Element {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const [zoneForm, setZoneForm] = useState({ name: '', country: '' });
  const [rateForm, setRateForm] = useState({
    zoneId: '',
    name: '',
    code: 'VAT_STANDARD',
    rate: 15,
  });

  const zones = useQuery({
    queryKey: ['finance-tax-zones'],
    queryFn: async () => {
      const res = await fetch('/api/finance/tax-zones', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return (json.data ?? []) as TaxZone[];
    },
  });

  const rates = useQuery({
    queryKey: ['finance-tax-rates'],
    queryFn: async () => {
      const res = await fetch('/api/finance/tax-rates', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return (json.data ?? []) as TaxRate[];
    },
  });

  const createZone = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/finance/tax-zones', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(zoneForm),
      });
      return res.json();
    },
    onSuccess: (json) => {
      if (json.success) {
        notify.success('Tax zone created');
        setZoneForm({ name: '', country: '' });
        qc.invalidateQueries({ queryKey: ['finance-tax-zones'] });
      } else notify.error('Create failed', json.error);
    },
  });

  const createRate = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/finance/tax-rates', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(rateForm),
      });
      return res.json();
    },
    onSuccess: (json) => {
      if (json.success) {
        notify.success('Tax rate created');
        qc.invalidateQueries({ queryKey: ['finance-tax-rates'] });
      } else notify.error('Create failed', json.error);
    },
  });

  return (
    <main className="space-y-4 p-6">
      <h1 className="text-2xl font-bold text-on-surface ">Tax Settings</h1>

      <section className="rounded-lg border bg-surface p-4 dark:border-outline-variant dark:bg-surface">
        <h2 className="mb-2 text-sm font-semibold dark:text-outline">Add Tax Zone</h2>
        <div className="grid gap-2 md:grid-cols-3">
          <input
            value={zoneForm.name}
            onChange={(e) => setZoneForm((s) => ({ ...s, name: e.target.value }))}
            className="rounded border bg-surface px-3 py-2 text-sm dark:border-outline-variant dark:bg-surface "
            placeholder="KSA VAT"
          />
          <input
            value={zoneForm.country}
            onChange={(e) => setZoneForm((s) => ({ ...s, country: e.target.value.toUpperCase() }))}
            className="rounded border bg-surface px-3 py-2 text-sm dark:border-outline-variant dark:bg-surface "
            placeholder="SA"
          />
          <Button onClick={() => createZone.mutate()}>Add Zone</Button>
        </div>
      </section>

      <section className="rounded-lg border bg-surface p-4 dark:border-outline-variant dark:bg-surface">
        <h2 className="mb-2 text-sm font-semibold dark:text-outline">Add Tax Rate</h2>
        <div className="grid gap-2 md:grid-cols-5">
          <select
            value={rateForm.zoneId}
            onChange={(e) => setRateForm((s) => ({ ...s, zoneId: e.target.value }))}
            className="rounded border bg-surface px-3 py-2 text-sm dark:border-outline-variant dark:bg-surface "
          >
            <option value="">Select zone</option>
            {(zones.data ?? []).map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
          <input value={rateForm.name} onChange={(e) => setRateForm((s) => ({ ...s, name: e.target.value }))} className="rounded border bg-surface px-3 py-2 text-sm dark:border-outline-variant dark:bg-surface " placeholder="Standard VAT" />
          <input value={rateForm.code} onChange={(e) => setRateForm((s) => ({ ...s, code: e.target.value }))} className="rounded border bg-surface px-3 py-2 text-sm dark:border-outline-variant dark:bg-surface " placeholder="VAT_STANDARD" />
          <input type="number" value={rateForm.rate} onChange={(e) => setRateForm((s) => ({ ...s, rate: Number(e.target.value || 0) }))} className="rounded border bg-surface px-3 py-2 text-sm dark:border-outline-variant dark:bg-surface " />
          <Button onClick={() => createRate.mutate()}>Add Rate</Button>
        </div>
      </section>

      <section className="rounded-lg border bg-surface p-3 dark:border-outline-variant dark:bg-surface">
        <h2 className="mb-2 text-sm font-semibold dark:text-outline">Zones</h2>
        <ul className="text-sm dark:text-outline">
          {(zones.data ?? []).map((z) => (
            <li key={z.id} className="border-t px-2 py-2 first:border-t-0 dark:border-outline-variant">
              {z.name} {z.country ? `(${z.country})` : ''}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border bg-surface p-3 dark:border-outline-variant dark:bg-surface">
        <h2 className="mb-2 text-sm font-semibold dark:text-outline">Rates</h2>
        <ul className="text-sm dark:text-outline">
          {(rates.data ?? []).map((r) => (
            <li key={r.id} className="border-t px-2 py-2 first:border-t-0 dark:border-outline-variant">
              {r.name} — {r.rate}% ({r.code})
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

