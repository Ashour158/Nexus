'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';
import { ShieldAlert } from 'lucide-react';

export default function DataPrivacyPage() {
  const token = useAuthStore((s) => s.accessToken);
  const roles = useAuthStore((s) => s.roles);
  const role = roles[0]?.toLowerCase() ?? '';
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [modules, setModules] = useState<string[]>(['all']);
  const [gdprEmail, setGdprEmail] = useState('');
  const [gdprReason, setGdprReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const { data: teamData } = useQuery({ queryKey: ['team'], queryFn: () => fetch('/api/auth/profile/team', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()) });

  const transfer = useMutation({ mutationFn: () => fetch('/api/auth/data-ownership/transfer', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fromUserId: transferFrom, toUserId: transferTo, modules }) }).then((r) => r.json()), onSuccess: (res) => res.success ? notify.success(res.message || 'Transfer initiated') : notify.error('Transfer failed', res.error) });
  const gdprErase = useMutation({ mutationFn: () => fetch('/api/auth/data-ownership/gdpe-erasure', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ contactEmail: gdprEmail, reason: gdprReason }) }).then((r) => r.json()), onSuccess: (res) => res.success ? notify.success(res.message || 'Erasure request submitted') : notify.error('Request failed', res.error) });

  if (role !== 'admin') return <div className="flex flex-col items-center justify-center py-20"><ShieldAlert className="mb-4 h-12 w-12 text-gray-300" /><h2 className="text-lg font-semibold text-gray-500">Admin Access Required</h2></div>;

  const users = (teamData?.data || []) as Array<{ id: string; firstName: string; lastName: string; email: string }>;

  return <div className="mx-auto max-w-3xl space-y-8 px-4 py-6"><div><h1 className="text-2xl font-bold text-gray-900">Data Ownership & Privacy</h1></div><div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><div className="grid grid-cols-2 gap-4"><select value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="">Transfer FROM</option>{users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}</select><select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="">Transfer TO</option>{users.filter((u) => u.id !== transferFrom).map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}</select></div><div className="mt-3 flex flex-wrap gap-2">{['all', 'contacts', 'deals', 'leads', 'accounts', 'activities'].map((mod) => <button key={mod} type="button" onClick={() => { if (mod === 'all') setModules(['all']); else setModules((prev) => prev.includes(mod) ? prev.filter((m) => m !== mod && m !== 'all') : [...prev.filter((m) => m !== 'all'), mod]); }} className={`rounded-lg px-3 py-1.5 text-sm ${modules.includes(mod) || (mod !== 'all' && modules.includes('all')) ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>{mod}</button>)}</div><button onClick={() => transfer.mutate()} disabled={!transferFrom || !transferTo} className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{transfer.isPending ? 'Initiating transfer...' : 'Transfer Records'}</button></div><div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm"><input type="email" value={gdprEmail} onChange={(e) => setGdprEmail(e.target.value)} placeholder="person@example.com" className="w-full rounded-lg border px-3 py-2 text-sm" /><textarea value={gdprReason} onChange={(e) => setGdprReason(e.target.value)} rows={2} placeholder="Reason" className="mt-3 w-full resize-none rounded-lg border px-3 py-2 text-sm" /><label className="mt-3 flex items-start gap-3"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span className="text-sm text-gray-600">I confirm this erasure is legally required and irreversible.</span></label><button onClick={() => gdprErase.mutate()} disabled={!gdprEmail || !confirmed} className="mt-4 w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{gdprErase.isPending ? 'Submitting...' : 'Submit Erasure Request'}</button></div></div>;}
