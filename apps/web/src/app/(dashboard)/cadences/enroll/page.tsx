'use client';

import { useState } from 'react';
import { useCadences } from '@/hooks/use-cadences';
import { apiClients } from '@/lib/api-client';
import { notify } from '@/lib/toast';

export default function CadenceEnrollPage() {
  const { data: cadences, isLoading } = useCadences();
  const [cadenceId, setCadenceId] = useState('');
  const [emails, setEmails] = useState('');
  const [startStep, setStartStep] = useState(1);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleEnroll() {
    if (!cadenceId) { notify.error('Select a cadence first'); return; }
    const emailList = emails.split(/[,\n]+/).map((e) => e.trim()).filter(Boolean);
    if (emailList.length === 0) { notify.error('Add at least one email'); return; }
    setSubmitting(true);
    try {
      await apiClients.cadence.post(`/${cadenceId}/enroll`, { emails: emailList, startStep });
      setDone(true);
      notify.success(`${emailList.length} contact(s) queued for enrollment`);
    } catch {
      notify.error('Enrollment failed — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="space-y-4 p-4 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">Quick Enroll</h1>
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <label className="block text-sm">
          Select cadence
          <select
            value={cadenceId}
            onChange={(e) => setCadenceId(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            disabled={isLoading}
          >
            <option value="">{isLoading ? 'Loading…' : '— choose a cadence —'}</option>
            {(cadences ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <textarea
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          rows={4}
          placeholder="Paste emails (comma or newline separated)"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <label className="block text-sm">
          Start at step
          <select
            value={startStep}
            onChange={(e) => setStartStep(Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>Step {n}</option>
            ))}
          </select>
        </label>
        <button
          onClick={handleEnroll}
          disabled={submitting || !cadenceId}
          className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Enrolling…' : 'Confirm enrollment'}
        </button>
        {done && <p className="text-sm text-emerald-700">Enrollment queued successfully.</p>}
      </section>
    </main>
  );
}
