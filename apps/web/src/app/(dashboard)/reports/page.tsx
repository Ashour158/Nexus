'use client';

import Link from 'next/link';

const REPORTS = [
  'Sales Pipeline Report',
  'Activity Summary Report',
  'Revenue Forecast Report',
  'Lead Source Analysis',
  'Deal Velocity Report',
  'Rep Performance Report',
  'Lost Deal Analysis',
  'Email Engagement Report',
  'Territory Performance Report',
  'Commission Summary Report',
];

export default function ReportsHomePage() {
  return (
    <main className="space-y-4 p-4">
      <header className="flex items-center justify-between"><h1 className="text-2xl font-bold text-slate-900">Reporting Center</h1><Link href="/reports/builder" className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white">Create custom report</Link></header>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{REPORTS.map((r, idx) => <article key={r} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xl">??</p><h2 className="mt-2 font-semibold text-slate-900">{r}</h2><p className="text-sm text-slate-500">Prebuilt report #{idx + 1}</p><p className="mt-2 text-xs text-slate-500">Last run: {idx + 1}h ago</p></article>)}</section>
    </main>
  );
}
