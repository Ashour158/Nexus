'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Save } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

type ForecastCategory = 'commit' | 'best_case' | 'pipeline' | 'omitted';

interface ForecastSubmission {
  id: string;
  weekOf: string;
  commit: number;
  bestCase: number;
  pipeline: number;
  notes?: string;
  submittedAt: string;
}

interface DealForecast {
  id: string;
  name: string;
  amount: number;
  stage: string;
  closeDate: string;
  category: ForecastCategory;
  probability: number;
}

export default function ForecastPage() {
  const roles = useAuthStore((s) => s.roles);
  const isManager = roles.includes('manager') || roles.includes('admin') || roles.includes('SALES_MANAGER') || roles.includes('ADMIN');
  const [activeView, setActiveView] = useState<'submit' | 'history' | 'team'>(isManager ? 'team' : 'submit');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [dealCategories, setDealCategories] = useState<Record<string, ForecastCategory>>({});
  const qc = useQueryClient();

  const weekOf = getMonday(new Date()).toISOString().split('T')[0];

  const { data: deals = [] } = useQuery<DealForecast[]>({ queryKey: ['forecast-deals'], queryFn: () => fetch('/api/forecast/deals').then((r) => r.json()) });
  const { data: history = [] } = useQuery<ForecastSubmission[]>({ queryKey: ['forecast-history'], queryFn: () => fetch('/api/forecast/history').then((r) => r.json()) });
  const { data: teamForecast = [] } = useQuery<any[]>({ queryKey: ['forecast-team'], queryFn: () => fetch('/api/forecast/team').then((r) => r.json()), enabled: isManager });

  const submitMutation = useMutation({
    mutationFn: (payload: { weekOf: string; dealCategories: Record<string, ForecastCategory>; notes: string }) =>
      fetch('/api/forecast/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then((r) => r.json()),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      void qc.invalidateQueries({ queryKey: ['forecast-history'] });
      void qc.invalidateQueries({ queryKey: ['forecast-team'] });
    },
  });

  const totals = useMemo(() => deals.reduce((acc, deal) => {
    const cat = dealCategories[deal.id] ?? deal.category;
    if (cat === 'commit') acc.commit += deal.amount;
    if (cat === 'commit' || cat === 'best_case') acc.bestCase += deal.amount;
    if (cat !== 'omitted') acc.pipeline += deal.amount;
    return acc;
  }, { commit: 0, bestCase: 0, pipeline: 0 }), [deals, dealCategories]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Forecast</h1><p className="mt-0.5 text-sm text-gray-500">Week of {weekOf}</p></div>
        <div className="flex overflow-hidden rounded-lg border border-gray-200">
          {[{ key: 'submit', label: 'My Forecast' }, { key: 'history', label: 'History' }, ...(isManager ? [{ key: 'team', label: 'Team Roll-up' }] : [])].map((v) => (
            <button key={v.key} onClick={() => setActiveView(v.key as any)} className={`px-4 py-2 text-sm font-medium transition-colors ${activeView === v.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{v.label}</button>
          ))}
        </div>
      </div>

      {activeView === 'submit' ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[{ label: 'Commit', value: totals.commit, color: 'text-blue-700', bg: 'bg-blue-50' }, { label: 'Best Case', value: totals.bestCase, color: 'text-amber-700', bg: 'bg-amber-50' }, { label: 'Pipeline', value: totals.pipeline, color: 'text-gray-700', bg: 'bg-gray-50' }].map((card) => (
              <div key={card.label} className={`${card.bg} rounded-xl p-5`}><p className="mb-1 text-sm text-gray-500">{card.label}</p><p className={`text-3xl font-bold ${card.color}`}>${(card.value / 1000).toFixed(1)}K</p></div>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-4"><h2 className="font-semibold text-gray-900">Categorize Your Deals</h2></div>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-gray-100 text-xs uppercase text-gray-500"><th className="px-5 py-3 text-start font-medium">Deal</th><th className="px-5 py-3 text-start font-medium">Stage</th><th className="px-5 py-3 text-start font-medium">Amount</th><th className="px-5 py-3 text-start font-medium">Close Date</th><th className="px-5 py-3 text-start font-medium">Category</th></tr></thead><tbody>
              {deals.map((deal, i) => {
                const cat = dealCategories[deal.id] ?? deal.category;
                return <tr key={deal.id} className={`border-b border-gray-50 ${i % 2 ? 'bg-gray-50/50' : ''}`}><td className="px-5 py-3 font-medium text-gray-900">{deal.name}</td><td className="px-5 py-3 text-gray-500">{deal.stage}</td><td className="px-5 py-3 font-medium">${deal.amount.toLocaleString()}</td><td className="px-5 py-3 text-gray-500">{new Date(deal.closeDate).toLocaleDateString()}</td><td className="px-5 py-3"><select value={cat} onChange={(e) => setDealCategories((prev) => ({ ...prev, [deal.id]: e.target.value as ForecastCategory }))} className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium"><option value="commit">Commit</option><option value="best_case">Best Case</option><option value="pipeline">Pipeline</option><option value="omitted">Omitted</option></select></td></tr>;
              })}
            </tbody></table></div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <label className="mb-2 block text-sm font-medium text-gray-700">Forecast Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <div className="mt-3 flex items-center justify-end gap-3">
              {saved ? <span className="flex items-center gap-1.5 text-sm text-green-600"><CheckCircle className="h-4 w-4" /> Forecast submitted</span> : null}
              <button onClick={() => submitMutation.mutate({ weekOf, dealCategories, notes })} disabled={submitMutation.isPending} className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Save className="h-4 w-4" />{submitMutation.isPending ? 'Submitting...' : 'Submit Forecast'}</button>
            </div>
          </div>
        </>
      ) : null}

      {activeView === 'history' ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4"><h2 className="font-semibold text-gray-900">Submission History</h2></div>
          <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 text-xs uppercase text-gray-500"><th className="px-5 py-3 text-start font-medium">Week Of</th><th className="px-5 py-3 text-start font-medium">Commit</th><th className="px-5 py-3 text-start font-medium">Best Case</th><th className="px-5 py-3 text-start font-medium">Pipeline</th><th className="px-5 py-3 text-start font-medium">Submitted</th></tr></thead><tbody>{history.map((h, i) => <tr key={h.id} className={`border-b border-gray-50 ${i % 2 ? 'bg-gray-50/50' : ''}`}><td className="px-5 py-3 font-medium">{h.weekOf}</td><td className="px-5 py-3 text-blue-700 font-medium">${(h.commit / 1000).toFixed(1)}K</td><td className="px-5 py-3 text-amber-700">${(h.bestCase / 1000).toFixed(1)}K</td><td className="px-5 py-3 text-gray-600">${(h.pipeline / 1000).toFixed(1)}K</td><td className="px-5 py-3 text-gray-400">{new Date(h.submittedAt).toLocaleDateString()}</td></tr>)}</tbody></table>
        </div>
      ) : null}

      {activeView === 'team' && isManager ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><h2 className="font-semibold text-gray-900">Team Forecast Roll-up</h2><span className="text-sm text-gray-500">{teamForecast.length} reps</span></div>
          <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 text-xs uppercase text-gray-500"><th className="px-5 py-3 text-start font-medium">Rep</th><th className="px-5 py-3 text-start font-medium">Quota</th><th className="px-5 py-3 text-start font-medium">Commit</th><th className="px-5 py-3 text-start font-medium">Best Case</th><th className="px-5 py-3 text-start font-medium">Pipeline</th><th className="px-5 py-3 text-start font-medium">Status</th></tr></thead><tbody>{teamForecast.map((rep, i) => <tr key={rep.userId ?? i} className={`border-b border-gray-50 ${i % 2 ? 'bg-gray-50/50' : ''}`}><td className="px-5 py-3 font-medium text-gray-900">{rep.name ?? rep.userId}</td><td className="px-5 py-3 text-gray-500">${((Number(rep.quota) || 0) / 1000).toFixed(0)}K</td><td className="px-5 py-3 text-blue-700 font-semibold">${((Number(rep.commit) || 0) / 1000).toFixed(1)}K</td><td className="px-5 py-3 text-amber-700">${((Number(rep.bestCase) || 0) / 1000).toFixed(1)}K</td><td className="px-5 py-3">${((Number(rep.pipeline) || 0) / 1000).toFixed(1)}K</td><td className="px-5 py-3">{rep.submitted ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Submitted</span> : <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">Pending</span>}</td></tr>)}</tbody></table>
        </div>
      ) : null}
    </div>
  );
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date;
}
