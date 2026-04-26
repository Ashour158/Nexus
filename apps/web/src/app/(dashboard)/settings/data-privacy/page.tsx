'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

type ExportRow = { id: string; requestedAt: string; status: 'PENDING' | 'PROCESSING' | 'READY'; expiresAt?: string };
type ConsentRow = { id: string; name: string; consent: string; updatedAt: string; audit: string };

export default function DataPrivacyPage() {
  const [contactQuery, setContactQuery] = useState('');
  const [residencyRegion, setResidencyRegion] = useState('eu-central-1');

  const exportsQuery = useQuery({
    queryKey: ['privacy-exports'],
    queryFn: async () => {
      const res = await fetch('/api/privacy/exports');
      return (await res.json()) as { data: ExportRow[] };
    },
  });

  const requestExport = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/privacy/exports', { method: 'POST' });
      return (await res.json()) as { data: ExportRow };
    },
    onSuccess: () => exportsQuery.refetch(),
  });

  const erasure = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/privacy/erasure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: contactQuery }),
      });
      return (await res.json()) as { data: { certificatePdfUrl: string } };
    },
  });

  const consents = useQuery({
    queryKey: ['privacy-consents'],
    queryFn: async () => {
      const res = await fetch('/api/privacy/consents');
      return (await res.json()) as { data: ConsentRow[] };
    },
  });

  const exportRows = exportsQuery.data?.data ?? [];

  return (
    <main className="max-w-5xl space-y-4 p-4">
      <h1 className="text-2xl font-bold text-slate-900">GDPR & Data Privacy</h1>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">My data export (Art. 20)</h2>
        <p className="text-sm text-slate-600">Includes contacts, deals, activities, emails, notes and attachments. ZIP with JSON + CSV summary.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => requestExport.mutate()} className="rounded bg-blue-600 px-3 py-2 text-sm text-white" disabled={requestExport.isPending}>Request export</button>
          <span className="rounded bg-slate-100 px-2 py-1 text-sm">Status: {exportRows[0]?.status ?? 'PENDING'}</span>
          {exportRows[0]?.status === 'READY' ? <button className="rounded border border-slate-300 px-3 py-2 text-sm">Download (expires in 24h)</button> : null}
        </div>
        <ul className="text-sm text-slate-600">{exportRows.map((row) => <li key={row.id}>{new Date(row.requestedAt).toLocaleString()} - {row.status} {row.expiresAt ? `(expires ${new Date(row.expiresAt).toLocaleString()})` : ''}</li>)}</ul>
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Right to erasure (Art. 17)</h2>
        <input value={contactQuery} onChange={(e) => setContactQuery(e.target.value)} placeholder="Search contact" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        <p className="text-sm text-slate-600">Records found for {contactQuery || 'selected contact'}: deals, activities, notes, documents.</p>
        <button onClick={() => erasure.mutate()} className="rounded border border-red-300 px-3 py-2 text-sm text-red-700" disabled={!contactQuery.trim() || erasure.isPending}>Erase all data</button>
        {erasure.data?.data?.certificatePdfUrl ? <p className="text-xs text-slate-500">Certificate: {erasure.data.data.certificatePdfUrl}</p> : null}
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Consent management</h2>
        <button className="rounded border border-slate-300 px-3 py-2 text-sm">Bulk update consent from CSV</button>
        <table className="min-w-full text-sm"><thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-2">Contact</th><th className="px-2 py-2">Consent</th><th className="px-2 py-2">Audit trail</th></tr></thead><tbody>{(consents.data?.data ?? []).map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="px-2 py-2">{row.name}</td><td className="px-2 py-2">{row.consent}</td><td className="px-2 py-2">{row.audit} ({new Date(row.updatedAt).toLocaleDateString()})</td></tr>)}</tbody></table>
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Data residency (admin)</h2>
        <p className="text-sm">Region: <strong>{residencyRegion}</strong></p>
        <select value={residencyRegion} onChange={(e) => setResidencyRegion(e.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm"><option>eu-central-1</option><option>us-east-1</option><option>me-central-1</option></select>
        <div className="grid gap-2 text-sm md:grid-cols-2"><label className="block">Leads retention (days)<input defaultValue={365} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" /></label><label className="block">Closed deals retention (days)<input defaultValue={2555} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" /></label><label className="block">Emails retention (days)<input defaultValue={730} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" /></label><label className="block">Call logs retention (days)<input defaultValue={365} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" /></label></div>
      </section>
    </main>
  );
}
