'use client';

import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

type Group = {
  id: string;
  confidence: number;
  contacts: Array<{ id: string; name: string; email: string; company: string; phone: string }>;
};

type ScanResponse = { data: { groups: Group[]; totalGroups: number } };

export default function ContactDuplicatesPage() {
  const [confidence, setConfidence] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [autoMergeExactEmail, setAutoMergeExactEmail] = useState(false);
  const [threshold, setThreshold] = useState(90);
  const [masterByGroup, setMasterByGroup] = useState<Record<string, string>>({});

  const scan = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/contacts/duplicates/scan', { method: 'POST' });
      return (await res.json()) as ScanResponse;
    },
  });

  const merge = useMutation({
    mutationFn: async (payload: { masterId: string; mergeIds: string[] }) => {
      const res = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    onSuccess: () => scan.mutate(),
  });

  const groups = useMemo(() => scan.data?.data.groups ?? [], [scan.data]);
  const filtered = groups.filter((g) => confidence === 'all' ? true : confidence === 'high' ? g.confidence > 90 : confidence === 'medium' ? g.confidence >= 60 && g.confidence <= 90 : g.confidence < 60);

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-2xl font-bold text-slate-900">Duplicate Contact Center</h1>
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => scan.mutate()} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white" disabled={scan.isPending}>Run duplicate scan</button>
          <p className="text-sm text-slate-600">{groups.length} potential duplicate groups found</p>
        </div>
        <div className="flex gap-2 text-sm"><select value={confidence} onChange={(e) => setConfidence(e.target.value as 'all' | 'high' | 'medium' | 'low')} className="rounded border border-slate-300 px-2 py-1"><option value="all">All confidence</option><option value="high">High {'>'}90%</option><option value="medium">Medium 60-90%</option><option value="low">Low {'<'}60%</option></select></div>
        <div className="space-y-2 rounded bg-slate-50 p-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={autoMergeExactEmail} onChange={(e) => setAutoMergeExactEmail(e.target.checked)} />Auto-merge exact email matches</label><label className="flex items-center gap-2">Auto-merge threshold<input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value || 90))} className="w-20 rounded border border-slate-300 px-2 py-1" />%</label></div>
      </section>

      <section className="space-y-3">
        {filtered.map((group) => {
          const master = masterByGroup[group.id] ?? group.contacts[0]?.id;
          return (
            <article key={group.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between"><p className="font-semibold text-slate-900">Group {group.id}</p><span className="text-sm text-slate-500">Confidence {group.confidence}%</span></div>
              <div className="grid gap-3 md:grid-cols-2">
                {group.contacts.map((c) => (
                  <div key={c.id} className="rounded border border-slate-200 p-3 text-sm">
                    <label className="inline-flex items-center gap-2"><input type="radio" name={`master-${group.id}`} checked={master === c.id} onChange={() => setMasterByGroup((prev) => ({ ...prev, [group.id]: c.id }))} />Master</label>
                    <p className="mt-1 bg-yellow-50 font-medium">{c.name}</p>
                    <p className="bg-green-50">{c.email}</p>
                    <p className="bg-yellow-50">{c.company}</p>
                    <p className="bg-green-50">{c.phone}</p>
                    <label className="mt-2 block text-xs"><input type="checkbox" className="mr-1" defaultChecked />Keep this record fields</label>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  className="rounded bg-blue-600 px-3 py-2 text-sm text-white"
                  onClick={() => {
                    const masterId = master;
                    const mergeIds = group.contacts.map((c) => c.id).filter((id) => id !== masterId);
                    merge.mutate({ masterId, mergeIds });
                  }}
                  disabled={merge.isPending}
                >
                  Merge
                </button>
                <button className="rounded border border-slate-300 px-3 py-2 text-sm">Not duplicates</button>
              </div>
            </article>
          );
        })}
        {scan.isSuccess && filtered.length === 0 ? <p className="text-sm text-slate-500">No duplicate groups matched current filter.</p> : null}
      </section>
    </main>
  );
}
