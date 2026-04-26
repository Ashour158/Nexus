'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';

type Cadence = { id: string; name: string; objectType: 'CONTACT' | 'LEAD'; stepCount?: number; enrollmentCount?: number; isActive: boolean; description?: string | null };

export default function CadencesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [objectType, setObjectType] = useState<'CONTACT' | 'LEAD'>('CONTACT');

  const cadences = useQuery({ queryKey: ['cadences'], queryFn: () => apiClients.cadence.get<Cadence[]>('/cadences') });

  const create = useMutation({
    mutationFn: () => apiClients.cadence.post('/cadences', { name, description, objectType, exitOnReply: true, exitOnMeeting: true, steps: [{ position: 0, type: 'WAIT', delayDays: 0 }] }),
    onSuccess: async () => { setName(''); setDescription(''); await qc.invalidateQueries({ queryKey: ['cadences'] }); },
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiClients.cadence.patch(`/cadences/${id}`, { isActive }),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['cadences'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClients.cadence.delete(`/cadences/${id}`),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['cadences'] }),
  });

  const rows = cadences.data ?? [];
  const active = useMemo(() => rows.filter((r) => r.isActive).length, [rows]);

  return (
    <main className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cadence Sequences</h1>
          <p className="text-sm text-slate-500">{active} active · {rows.reduce((s, r) => s + (r.enrollmentCount ?? 0), 0)} prospects enrolled</p>
        </div>
        <Link href="/cadences/enroll" className="rounded border border-slate-300 px-3 py-2 text-sm">Quick enroll</Link>
      </header>

      <section className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cadence name" className="rounded border border-slate-300 px-3 py-2 text-sm" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="rounded border border-slate-300 px-3 py-2 text-sm" />
        <select value={objectType} onChange={(e) => setObjectType(e.target.value as 'CONTACT' | 'LEAD')} className="rounded border border-slate-300 px-3 py-2 text-sm"><option value="CONTACT">CONTACT</option><option value="LEAD">LEAD</option></select>
        <button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Create cadence</button>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Steps</th><th className="px-3 py-2">Enrolled</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="px-3 py-2"><Link href={`/cadences/${row.id}`} className="font-medium hover:underline">{row.name}</Link></td><td className="px-3 py-2">{row.objectType}</td><td className="px-3 py-2">{row.stepCount ?? 0}</td><td className="px-3 py-2">{row.enrollmentCount ?? 0}</td><td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs ${row.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{row.isActive ? 'Active' : 'Paused'}</span></td><td className="px-3 py-2 text-right"><div className="inline-flex gap-1"><button onClick={() => toggle.mutate({ id: row.id, isActive: !row.isActive })} className="rounded border border-slate-300 px-2 py-1 text-xs">{row.isActive ? 'Pause' : 'Resume'}</button><button onClick={() => remove.mutate(row.id)} className="rounded border border-red-300 px-2 py-1 text-xs text-red-700">Delete</button></div></td></tr>)}{rows.length===0?<tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">{cadences.isLoading ? 'Loading...' : 'No cadences found.'}</td></tr>:null}</tbody></table>
      </section>
    </main>
  );
}
