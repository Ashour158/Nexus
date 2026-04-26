'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { Users } from 'lucide-react';

const REPS = [
  { id: 'r1', name: 'Carlos Mendez', quota: 220000, revenue: 182000, won: 12, activities: 244, responseHrs: 2.8 },
  { id: 'r2', name: 'Sofia Rodriguez', quota: 200000, revenue: 168000, won: 11, activities: 232, responseHrs: 3.4 },
  { id: 'r3', name: 'Marcus Chen', quota: 185000, revenue: 151000, won: 9, activities: 210, responseHrs: 4.8 },
];

const ACTIVITY = [
  { week: 'W1', calls: 130, emails: 190, meetings: 42, demos: 11 },
  { week: 'W2', calls: 142, emails: 204, meetings: 40, demos: 14 },
  { week: 'W3', calls: 136, emails: 198, meetings: 45, demos: 15 },
  { week: 'W4', calls: 150, emails: 215, meetings: 49, demos: 18 },
];

const CUMULATIVE = [
  { week: 'W1', carlos: 42000, sofia: 38000, marcus: 29000, quota: 50000 },
  { week: 'W2', carlos: 79000, sofia: 72000, marcus: 61000, quota: 100000 },
  { week: 'W3', carlos: 128000, sofia: 119000, marcus: 98000, quota: 150000 },
  { week: 'W4', carlos: 182000, sofia: 168000, marcus: 151000, quota: 200000 },
];

const LOST_REASONS = [
  { reason: 'Budget', count: 12 },
  { reason: 'No urgency', count: 9 },
  { reason: 'Competitor', count: 7 },
  { reason: 'Missing feature', count: 5 },
];

const COMPETITORS = [
  { name: 'Salesforce', mentions: 18 },
  { name: 'HubSpot', mentions: 11 },
  { name: 'Zoho', mentions: 8 },
  { name: 'Pipedrive', mentions: 7 },
  { name: 'Freshsales', mentions: 6 },
];

export default function PerformanceDashboardPage() {
  const [team, setTeam] = useState('all');
  const [rep, setRep] = useState('all');
  const [product, setProduct] = useState('all');

  const wonLost = useMemo(() => [{ name: 'Won', value: 34 }, { name: 'Lost', value: 22 }], []);

  return (
    <main className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold text-slate-900">Sales Performance</h1>
        <div className="grid gap-2 md:grid-cols-4">
          <DateRangePicker />
          <select value={team} onChange={(e) => setTeam(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="all">All teams</option><option value="enterprise">Enterprise</option><option value="midmarket">Mid-market</option></select>
          <select value={rep} onChange={(e) => setRep(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="all">All reps</option>{REPS.map((r) => <option key={r.id}>{r.name}</option>)}</select>
          <select value={product} onChange={(e) => setProduct(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="all">All products</option><option value="core">Core</option><option value="addons">Add-ons</option></select>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPS.map((row) => (
          <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold">{row.name.split(' ').map((p) => p[0]).join('')}</span>
              <div>
                <p className="font-semibold text-slate-900">{row.name}</p>
                <p className="text-xs text-slate-500">{row.won} deals won</p>
              </div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, (row.revenue / row.quota) * 100)}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <p>Revenue: <span className="font-semibold">${row.revenue.toLocaleString()}</span></p>
              <p>Quota: <span className="font-semibold">${row.quota.toLocaleString()}</span></p>
              <p>Activities: <span className="font-semibold">{row.activities}</span></p>
              <p>Response: <span className="font-semibold">{row.responseHrs}h</span></p>
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Activity breakdown</h2>
        <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={ACTIVITY}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="week" /><YAxis /><Tooltip /><Legend /><Bar dataKey="calls" fill="#2563eb" /><Bar dataKey="emails" fill="#0891b2" /><Bar dataKey="meetings" fill="#16a34a" /><Bar dataKey="demos" fill="#f59e0b" /></BarChart></ResponsiveContainer></div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Revenue vs Quota</h2>
        <div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={CUMULATIVE}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="week" /><YAxis /><Tooltip /><Legend /><Line dataKey="carlos" stroke="#2563eb" strokeWidth={2} /><Line dataKey="sofia" stroke="#16a34a" strokeWidth={2} /><Line dataKey="marcus" stroke="#f59e0b" strokeWidth={2} /><Line dataKey="quota" stroke="#64748b" strokeDasharray="6 4" /></LineChart></ResponsiveContainer></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Win/Loss analysis</h2>
          <div className="h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={wonLost} dataKey="value" nameKey="name" innerRadius={40} outerRadius={75} fill="#2563eb" /><Tooltip /></PieChart></ResponsiveContainer></div>
          <div className="mt-3 h-44"><ResponsiveContainer width="100%" height="100%"><BarChart data={LOST_REASONS}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="reason" /><YAxis /><Tooltip /><Bar dataKey="count" fill="#dc2626" /></BarChart></ResponsiveContainer></div>
          <div className="mt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top competitors in lost deals</h3>
            <ul className="mt-2 space-y-1 text-sm">{COMPETITORS.map((c) => <li key={c.name} className="flex justify-between"><span>{c.name}</span><span className="font-semibold">{c.mentions}</span></li>)}</ul>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Response time analysis</h2>
          <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={REPS}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="responseHrs" fill="#7c3aed" /></BarChart></ResponsiveContainer></div>
          <p className="mt-3 text-xs text-slate-500">SLA target: 4 hours. Reps above threshold should receive coaching support.</p>
          {REPS.length === 0 ? <EmptyState icon={<Users className="h-5 w-5" />} title="No reps selected" description="Adjust your filters to display performance cards." /> : null}
        </div>
      </section>
    </main>
  );
}
