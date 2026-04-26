'use client';

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Funnel, FunnelChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Gauge, Hourglass, Target } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';

const FUNNEL = [
  { stage: 'Qualification', deals: 44, value: 278000, conversion: 100 },
  { stage: 'Proposal', deals: 31, value: 221000, conversion: 70 },
  { stage: 'Negotiation', deals: 19, value: 154000, conversion: 61 },
  { stage: 'Commit', deals: 10, value: 95000, conversion: 53 },
  { stage: 'Closed Won', deals: 7, value: 82000, conversion: 70 },
];

const DEAL_FLOW = [
  { week: 'W1', newDeals: 14, won: 4, lost: 2 },
  { week: 'W2', newDeals: 18, won: 6, lost: 3 },
  { week: 'W3', newDeals: 16, won: 5, lost: 4 },
  { week: 'W4', newDeals: 20, won: 8, lost: 3 },
  { week: 'W5', newDeals: 17, won: 7, lost: 2 },
  { week: 'W6', newDeals: 15, won: 6, lost: 5 },
];

const STAGE_DAYS = [
  { stage: 'Qualification', days: 8 },
  { stage: 'Proposal', days: 10 },
  { stage: 'Negotiation', days: 13 },
  { stage: 'Commit', days: 7 },
];

const COHORT_ROWS = [
  { month: 'Jan', qualification: 12, proposal: 7, negotiation: 3, commit: 1 },
  { month: 'Feb', qualification: 9, proposal: 6, negotiation: 4, commit: 2 },
  { month: 'Mar', qualification: 14, proposal: 8, negotiation: 5, commit: 2 },
  { month: 'Apr', qualification: 11, proposal: 9, negotiation: 6, commit: 3 },
];

export default function PipelineAnalyticsPage() {
  const avgPipelineDays = useMemo(() => Math.round(STAGE_DAYS.reduce((sum, s) => sum + s.days, 0) * 1.35), []);

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Pipeline Analytics</h1>
        <p className="text-sm text-slate-500">Deep visibility into conversions, velocity, and forecast confidence.</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Funnel visualization</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart>
              <Tooltip />
              <Funnel dataKey="deals" data={FUNNEL} isAnimationActive>
                <LabelList position="right" fill="#0f172a" stroke="none" dataKey="stage" />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>
        <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-5">
          {FUNNEL.map((row) => (
            <p key={row.stage}>{row.stage}: {row.deals} deals · ${row.value.toLocaleString()} · {row.conversion}%</p>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Average days in pipeline" value={avgPipelineDays} delta={-4.2} icon={<Hourglass className="h-5 w-5" />} iconBg="bg-amber-100 text-amber-700" />
        <StatCard label="Avg days per stage" value={Math.round(STAGE_DAYS.reduce((s, r) => s + r.days, 0) / STAGE_DAYS.length)} delta={2.4} icon={<Gauge className="h-5 w-5" />} iconBg="bg-blue-100 text-blue-700" />
        <StatCard label="Deals stalled >14 days" value={9} delta={11.1} icon={<AlertTriangle className="h-5 w-5" />} iconBg="bg-rose-100 text-rose-700" />
        <StatCard label="Projected close this month" value={126000} format="currency" delta={6.5} icon={<Target className="h-5 w-5" />} iconBg="bg-emerald-100 text-emerald-700" />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Deal flow over time</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={DEAL_FLOW}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="newDeals" stackId="a" fill="#2563eb" />
              <Bar dataKey="won" stackId="a" fill="#16a34a" />
              <Bar dataKey="lost" stackId="a" fill="#dc2626" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Cohort table</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2">Month created</th>
                <th className="px-2 py-2">Qualification</th>
                <th className="px-2 py-2">Proposal</th>
                <th className="px-2 py-2">Negotiation</th>
                <th className="px-2 py-2">Commit</th>
              </tr>
            </thead>
            <tbody>
              {COHORT_ROWS.map((row) => (
                <tr key={row.month} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-medium">{row.month}</td>
                  <td className="px-2 py-2">{row.qualification}</td>
                  <td className="px-2 py-2">{row.proposal}</td>
                  <td className="px-2 py-2">{row.negotiation}</td>
                  <td className={`px-2 py-2 ${row.commit <= 1 ? 'text-rose-600 font-semibold' : ''}`}>{row.commit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
