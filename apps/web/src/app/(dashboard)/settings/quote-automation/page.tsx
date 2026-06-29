'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';

type Rule = {
  id: string;
  name: string;
  trigger: string;
  isActive: boolean;
};

export default function QuoteAutomationPage(): JSX.Element {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    trigger: 'deal_stage_changed',
  });

  const rules = useQuery({
    queryKey: ['quote-automation-rules'],
    queryFn: async () => {
      const res = await fetch('/api/finance/quote-automation-rules', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      return (json.data ?? []) as Rule[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/finance/quote-automation-rules', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          isActive: true,
          conditions: {},
          actions: [{ type: 'create_quote', assignTo: 'deal_owner' }],
        }),
      });
      return res.json();
    },
    onSuccess: (json) => {
      if (json.success) {
        notify.success('Rule created');
        setForm({ name: '', trigger: 'deal_stage_changed' });
        qc.invalidateQueries({ queryKey: ['quote-automation-rules'] });
      } else notify.error('Create failed', json.error);
    },
  });

  const toggle = useMutation({
    mutationFn: async (rule: Rule) => {
      const res = await fetch(`/api/finance/quote-automation-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quote-automation-rules'] }),
  });

  return (
    <main className="space-y-4 p-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Quote Automation</h1>
      <section className="rounded border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="grid gap-2 md:grid-cols-3">
          <input
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            className="rounded border bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            placeholder="Rule name"
          />
          <select
            value={form.trigger}
            onChange={(e) => setForm((s) => ({ ...s, trigger: e.target.value }))}
            className="rounded border bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="deal_stage_changed">Deal stage changed</option>
            <option value="rfq_received">RFQ received</option>
            <option value="deal_created">Deal created</option>
          </select>
          <Button onClick={() => create.mutate()}>Add Rule</Button>
        </div>
      </section>

      <section className="rounded border bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="text-start text-xs uppercase text-gray-500 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">Rule</th>
              <th className="px-3 py-2">Trigger</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(rules.data ?? []).map((rule) => (
              <tr key={rule.id} className="border-t dark:border-slate-700">
                <td className="px-3 py-2">{rule.name}</td>
                <td className="px-3 py-2">{rule.trigger}</td>
                <td className="px-3 py-2">{rule.isActive ? 'Active' : 'Disabled'}</td>
                <td className="px-3 py-2 text-end">
                  <Button onClick={() => toggle.mutate(rule)} variant="secondary" className="h-7 px-2 text-xs">
                    {rule.isActive ? 'Disable' : 'Enable'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

