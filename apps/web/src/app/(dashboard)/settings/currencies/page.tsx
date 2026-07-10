'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';

type Currency = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  isBase: boolean;
  isActive: boolean;
  decimalPlaces: number;
};

export default function CurrenciesPage(): JSX.Element {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimalPlaces: 2,
    isBase: false,
  });

  const list = useQuery({
    queryKey: ['finance-currencies'],
    queryFn: async () => {
      const res = await fetch('/api/finance/currencies', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return (json.data ?? []) as Currency[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/finance/currencies', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
      return res.json();
    },
    onSuccess: (json) => {
      if (json.success) {
        notify.success('Currency created');
        qc.invalidateQueries({ queryKey: ['finance-currencies'] });
      } else {
        notify.error('Create failed', json.error);
      }
    },
  });

  const toggleBase = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/finance/currencies/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isBase: true }),
      });
      return res.json();
    },
    onSuccess: (json) => {
      if (json.success) {
        notify.success('Base currency updated');
        qc.invalidateQueries({ queryKey: ['finance-currencies'] });
      }
    },
  });

  return (
    <main className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">Currencies</h1>

      <section className="rounded-lg border bg-white p-4">
        <div className="grid gap-2 md:grid-cols-5">
          <input
            value={form.code}
            onChange={(e) => setForm((s) => ({ ...s, code: e.target.value.toUpperCase() }))}
            className="rounded border px-3 py-2 text-sm"
            placeholder="Code"
          />
          <input
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            className="rounded border px-3 py-2 text-sm"
            placeholder="Name"
          />
          <input
            value={form.symbol}
            onChange={(e) => setForm((s) => ({ ...s, symbol: e.target.value }))}
            className="rounded border px-3 py-2 text-sm"
            placeholder="Symbol"
          />
          <input
            type="number"
            value={form.decimalPlaces}
            onChange={(e) =>
              setForm((s) => ({ ...s, decimalPlaces: Number(e.target.value || 2) }))
            }
            className="rounded border px-3 py-2 text-sm"
            placeholder="Decimals"
          />
          <button
            onClick={() => create.mutate()}
            className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white"
          >
            Add Currency
          </button>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-2">
        <table className="w-full text-sm">
          <thead className="text-start text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Decimals</th>
              <th className="px-3 py-2">Base</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2">{c.code}</td>
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2">{c.symbol}</td>
                <td className="px-3 py-2">{c.decimalPlaces}</td>
                <td className="px-3 py-2">{c.isBase ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2">
                  {!c.isBase ? (
                    <button
                      onClick={() => toggleBase.mutate(c.id)}
                      className="rounded border px-2 py-1 text-xs"
                    >
                      Set base
                    </button>
                  ) : (
                    <span className="text-xs text-green-700">Default</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

