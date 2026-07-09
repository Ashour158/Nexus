'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

interface ScoringRule {
  id: string;
  name: string;
  signal: string;
  points: number;
  isActive: boolean;
}

const SIGNAL_OPTIONS = [
  'email_opened',
  'meeting_booked',
  'demo_requested',
  'form_submit',
  'page_view',
  'company_size',
  'industry_match',
  'recency_decay',
];

const DEV_SCORING_RULES: ScoringRule[] =
  process.env.NODE_ENV === 'development'
    ? [
        {
          id: 'score-meeting-booked',
          name: 'Meeting booked',
          signal: 'meeting_booked',
          points: 25,
          isActive: true,
        },
        {
          id: 'score-demo-requested',
          name: 'Demo requested',
          signal: 'demo_requested',
          points: 35,
          isActive: true,
        },
        {
          id: 'score-recency-decay',
          name: 'Inactive lead decay',
          signal: 'recency_decay',
          points: -10,
          isActive: true,
        },
      ]
    : [];

export default function ScoringRulesPage() {
  const [rules, setRules] = useState<ScoringRule[]>(DEV_SCORING_RULES);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', signal: 'email_opened', points: 5 });

  const fetchRules = () =>
    fetch('/api/crm/scoring-rules')
      .then((r) => {
        if (!r.ok) throw new Error(`Scoring rules request failed (${r.status})`);
        return r.json();
      })
      .then((d) => {
        setRules(Array.isArray(d.data) ? d.data : []);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load scoring rules');
      });

  useEffect(() => {
    void fetchRules();
  }, []);

  const handleCreate = async () => {
    const res = await fetch('/api/crm/scoring-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      setError(`Unable to create rule (${res.status})`);
      return;
    }
    setShowForm(false);
    setForm({ name: '', signal: 'email_opened', points: 5 });
    void fetchRules();
  };

  const toggleActive = async (rule: ScoringRule) => {
    await fetch(`/api/crm/scoring-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !rule.isActive }),
    });
    void fetchRules();
  };

  const deleteRule = async (id: string) => {
    await fetch(`/api/crm/scoring-rules/${id}`, { method: 'DELETE' });
    void fetchRules();
  };

  return (
    <div className="max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Lead Scoring Rules</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Customize how NEXUS scores your leads</p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          + Add Rule
        </Button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 grid grid-cols-3 gap-3">
            <input
              placeholder="Rule name"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <select
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={form.signal}
              onChange={(e) => setForm((f) => ({ ...f, signal: e.target.value }))}
            >
              {SIGNAL_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Points"
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={form.points}
              onChange={(e) => setForm((f) => ({ ...f, points: Number.parseInt(e.target.value, 10) || 0 }))}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} className="bg-indigo-600 px-3 py-1.5 text-sm hover:bg-indigo-700">
              Save
            </Button>
            <Button
              onClick={() => setShowForm(false)}
              variant="secondary"
              className="px-3 py-1.5 text-sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 dark:border-slate-700 dark:bg-slate-950">
            <tr>
              <th className="px-4 py-3 text-start font-medium text-gray-500 dark:text-slate-400">Rule</th>
              <th className="px-4 py-3 text-start font-medium text-gray-500 dark:text-slate-400">Signal</th>
              <th className="px-4 py-3 text-end font-medium text-gray-500 dark:text-slate-400">Points</th>
              <th className="px-4 py-3 text-center font-medium text-gray-500 dark:text-slate-400">Active</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {rules.map((rule) => (
              <tr key={rule.id} className={!rule.isActive ? 'opacity-50' : undefined}>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-slate-100">{rule.name}</td>
                <td className="px-4 py-3 capitalize text-gray-600 dark:text-slate-300">{rule.signal.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-end font-bold dark:text-slate-200">{rule.points}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleActive(rule)}
                    className={`h-5 w-9 rounded-full ${rule.isActive ? 'bg-indigo-500' : 'bg-gray-300'}`}
                  >
                    <span
                      className={`mx-0.5 block h-4 w-4 rounded-full bg-white shadow ${
                        rule.isActive ? 'translate-x-4' : ''
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3 text-end">
                  <button onClick={() => deleteRule(rule.id)} className="text-xs text-gray-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400">
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {rules.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-slate-400">
                  No scoring rules configured yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
