'use client';

import { useState } from 'react';

export default function CadenceEnrollPage() {
  const [cadenceId, setCadenceId] = useState('c1');
  const [search, setSearch] = useState('');
  const [emails, setEmails] = useState('');
  const [startStep, setStartStep] = useState(1);
  const [done, setDone] = useState(false);

  return (
    <main className="space-y-4 p-4 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">Quick Enroll</h1>
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <label className="block text-sm">Select cadence<select value={cadenceId} onChange={(e) => setCadenceId(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2"><option value="c1">Outbound - New ICP</option><option value="c2">Inbound re-engage</option><option value="c3">Nurture Q2 webinar</option></select></label>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        <textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={4} placeholder="Paste emails (comma/newline)" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        <label className="block text-sm">Upload CSV<input type="file" accept=".csv" className="mt-1 block w-full text-sm" /></label>
        <label className="block text-sm">Start at step<select value={startStep} onChange={(e) => setStartStep(Number(e.target.value))} className="mt-1 w-full rounded border border-slate-300 px-3 py-2"><option value={1}>Step 1</option><option value={2}>Step 2</option><option value={3}>Step 3</option></select></label>
        <p className="rounded bg-slate-50 p-2 text-xs text-slate-600">Preview: contacts will enter at step {startStep} in cadence {cadenceId}.</p>
        <button onClick={() => setDone(true)} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white">Confirm enrollment</button>
        {done ? <p className="text-sm text-emerald-700">Enrollment queued successfully.</p> : null}
      </section>
    </main>
  );
}
