'use client';

import { useMemo, useState, type JSX } from 'react';

const TERRITORIES = [
  { id: 't1', name: 'North America Enterprise', rep: 'Carlos Mendez', deals: 27, pipeline: 410000, ytd: 680000, quota: 82, leads: 44, region: 'North America', winRate: 42, growth: 12 },
  { id: 't2', name: 'EMEA Mid-Market', rep: 'Sofia Rodriguez', deals: 21, pipeline: 290000, ytd: 510000, quota: 76, leads: 37, region: 'EMEA', winRate: 38, growth: 9 },
  { id: 't3', name: 'APAC Growth', rep: 'Marcus Chen', deals: 18, pipeline: 245000, ytd: 430000, quota: 68, leads: 33, region: 'APAC', winRate: 35, growth: 7 },
];

const LEAKAGE = [
  { deal: 'Apex Rollout', contact: 'Nina Volkov', contactRegion: 'EMEA', assignedRep: 'Carlos Mendez', correctRep: 'Sofia Rodriguez' },
  { deal: 'Kite Renewal', contact: 'Arun Patel', contactRegion: 'APAC', assignedRep: 'Sofia Rodriguez', correctRep: 'Marcus Chen' },
  { deal: 'Helio Migration', contact: 'Claire Dubois', contactRegion: 'North America', assignedRep: 'Marcus Chen', correctRep: 'Carlos Mendez' },
];

export default function TerritoriesPage(): JSX.Element {
  const [region, setRegion] = useState('all');

  const filtered = useMemo(
    () => TERRITORIES.filter((t) => region === 'all' || t.region === region),
    [region]
  );

  return (
    <main className="space-y-6 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Territory Dashboard</h1>
          <p className="text-sm text-slate-500">Regional performance and assignment leakage visibility.</p>
        </div>
        <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="all">All regions</option>
          <option value="North America">North America</option>
          <option value="EMEA">EMEA</option>
          <option value="APAC">APAC</option>
        </select>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Regional map placeholder</h2>
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          Interactive map is disabled without API key. Use territory cards and comparison table below.
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((t) => (
          <article key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">{t.name}</h3>
            <p className="text-xs text-slate-500">Assigned rep: {t.rep}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-slate-500">Deals</dt><dd className="font-semibold">{t.deals}</dd></div>
              <div><dt className="text-slate-500">Pipeline</dt><dd className="font-semibold">${t.pipeline.toLocaleString()}</dd></div>
              <div><dt className="text-slate-500">YTD revenue</dt><dd className="font-semibold">${t.ytd.toLocaleString()}</dd></div>
              <div><dt className="text-slate-500">Quota attainment</dt><dd className="font-semibold">{t.quota}%</dd></div>
              <div><dt className="text-slate-500">Open leads</dt><dd className="font-semibold">{t.leads}</dd></div>
            </dl>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Territory comparison</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-2">Territory</th><th className="px-2 py-2">Rep</th><th className="px-2 py-2">Leads</th><th className="px-2 py-2">Deals</th><th className="px-2 py-2">Revenue</th><th className="px-2 py-2">Win rate</th><th className="px-2 py-2">Growth vs last quarter</th></tr></thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-medium">{row.name}</td>
                  <td className="px-2 py-2">{row.rep}</td>
                  <td className="px-2 py-2">{row.leads}</td>
                  <td className="px-2 py-2">{row.deals}</td>
                  <td className="px-2 py-2">${row.ytd.toLocaleString()}</td>
                  <td className="px-2 py-2">{row.winRate}%</td>
                  <td className="px-2 py-2">{row.growth > 0 ? '+' : ''}{row.growth}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
        <h2 className="mb-3 text-sm font-semibold text-rose-800">Leakage alert</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-rose-900">
            <thead className="text-left text-xs uppercase tracking-wide text-rose-600"><tr><th className="px-2 py-2">Deal</th><th className="px-2 py-2">Contact</th><th className="px-2 py-2">Contact region</th><th className="px-2 py-2">Assigned rep</th><th className="px-2 py-2">Correct rep</th></tr></thead>
            <tbody>
              {LEAKAGE.map((row) => (
                <tr key={row.deal} className="border-t border-rose-200">
                  <td className="px-2 py-2 font-medium">{row.deal}</td>
                  <td className="px-2 py-2">{row.contact}</td>
                  <td className="px-2 py-2">{row.contactRegion}</td>
                  <td className="px-2 py-2">{row.assignedRep}</td>
                  <td className="px-2 py-2 font-semibold">{row.correctRep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
