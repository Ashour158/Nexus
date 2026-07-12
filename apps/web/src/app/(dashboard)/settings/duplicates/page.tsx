'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';
import { CheckCircle, ChevronRight, GitMerge, ScanLine, X } from 'lucide-react';

type DuplicateRecord = { id: string; recordId: string; score: number; isMaster: boolean; data: Record<string, unknown> | null };
type DuplicateGroup = { id: string; entityType: string; status: string; records: DuplicateRecord[] };

function MergePanel({ group, onClose, onMerged }: { group: DuplicateGroup; onClose: () => void; onMerged: () => void }) {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const [masterId, setMasterId] = useState(group.records.find((r) => r.isMaster)?.recordId || group.records[0]?.recordId);
  const [fieldSelections, setFieldSelections] = useState<Record<string, { sourceId: string; value: unknown }>>({});
  const fields = group.entityType === 'contact' ? ['firstName', 'lastName', 'email', 'phone', 'jobTitle', 'tags'] : ['name', 'email', 'phone', 'website', 'industry', 'country', 'tags'];

  const merge = useMutation({
    mutationFn: () => fetch(`/api/crm/dedup/groups/${group.id}/merge`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ masterId, fieldSelections }) }).then((r) => r.json()),
    onSuccess: (res) => {
      if (res.success) {
        notify.success(`Merged ${res.data.merged} duplicate records`);
        qc.invalidateQueries({ queryKey: ['dedup-groups'] });
        onMerged();
      } else notify.error('Merge failed', res.error);
    },
  });

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/50 p-4"><div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-surface shadow-2xl"><div className="flex items-center justify-between border-b p-5"><h2 className="text-lg font-bold">Merge Duplicate {group.entityType}</h2><button onClick={onClose}><X className="h-5 w-5" /></button></div><div className="flex-1 overflow-auto p-5"><div className="mb-4 flex gap-2">{group.records.map((rec) => <button key={rec.recordId} onClick={() => setMasterId(rec.recordId)} className={`rounded-lg border px-3 py-1.5 text-sm ${masterId === rec.recordId ? 'border-primary bg-primary text-white' : 'border-outline-variant'}`}>{String(rec.data?.firstName || rec.data?.name || rec.recordId)}</button>)}</div><table className="w-full text-sm"><thead><tr><th className="px-3 py-2 text-start">Field</th>{group.records.map((r) => <th key={r.recordId} className="px-3 py-2 text-start">{String(r.data?.firstName || r.data?.name || r.recordId)}</th>)}<th className="bg-primary-container px-3 py-2 text-start">Merged</th></tr></thead><tbody>{fields.map((field) => (<tr key={field} className="border-t"><td className="px-3 py-2">{field}</td>{group.records.map((rec) => { const val = rec.data?.[field]; const selected = fieldSelections[field]?.sourceId === rec.recordId; return <td key={rec.recordId} className="px-3 py-2"><button onClick={() => setFieldSelections((s) => ({ ...s, [field]: { sourceId: rec.recordId, value: val } }))} className={`rounded px-2 py-1 ${selected ? 'bg-primary-container' : 'hover:bg-surface-container-high'}`}>{Array.isArray(val) ? (val as string[]).join(', ') : String(val || '-')}</button></td>; })}<td className="bg-primary-container px-3 py-2">{String(fieldSelections[field]?.value ?? group.records.find((r) => r.recordId === masterId)?.data?.[field] ?? '-')}</td></tr>))}</tbody></table></div><div className="flex justify-end gap-3 border-t p-5"><button onClick={onClose} className="px-4 py-2 text-sm">Cancel</button><button onClick={() => merge.mutate()} className="rounded-lg bg-primary px-5 py-2 text-sm text-white">{merge.isPending ? 'Merging...' : 'Merge Records'}</button></div></div></div>;
}

export default function DuplicatesPage() {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const [entityFilter, setEntityFilter] = useState<'contact' | 'account' | ''>('');
  const [merging, setMerging] = useState<DuplicateGroup | null>(null);

  const { data: stats } = useQuery({ queryKey: ['dedup-stats'], queryFn: () => fetch('/api/crm/dedup/stats', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()) });
  const { data, isLoading } = useQuery({ queryKey: ['dedup-groups', entityFilter], queryFn: () => fetch(`/api/crm/dedup/groups${entityFilter ? `?entityType=${entityFilter}` : ''}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()) });

  const scan = useMutation({ mutationFn: () => fetch('/api/crm/dedup/scan', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()), onSuccess: () => { notify.success('Duplicate scan started'); setTimeout(() => qc.invalidateQueries({ queryKey: ['dedup-groups'] }), 5000); } });
  const dismiss = useMutation({ mutationFn: (id: string) => fetch(`/api/crm/dedup/groups/${id}/dismiss`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()), onSuccess: () => { notify.success('Marked as not duplicates'); qc.invalidateQueries({ queryKey: ['dedup-groups'] }); } });

  const groups: DuplicateGroup[] = data?.data?.groups || [];
  const statsData = stats?.data || {};

  return <div className="mx-auto max-w-6xl px-4 py-6">{merging && <MergePanel group={merging} onClose={() => setMerging(null)} onMerged={() => setMerging(null)} />}<div className="mb-6 flex items-center justify-between"><div><h1 className="text-2xl font-bold text-on-surface">Duplicate Records</h1></div><button onClick={() => scan.mutate()} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"><ScanLine className="h-4 w-4" />{scan.isPending ? 'Scanning...' : 'Scan Now'}</button></div><div className="mb-6 grid grid-cols-3 gap-4"><div className="rounded-xl border p-4"><p className="text-2xl font-bold text-warning">{statsData.pendingContacts ?? 0}</p></div><div className="rounded-xl border p-4"><p className="text-2xl font-bold text-warning">{statsData.pendingAccounts ?? 0}</p></div><div className="rounded-xl border p-4"><p className="text-2xl font-bold text-success">{statsData.mergedTotal ?? 0}</p></div></div><div className="mb-4 flex gap-2">{(['', 'contact', 'account'] as const).map((f) => <button key={f} onClick={() => setEntityFilter(f)} className={`rounded-lg px-3 py-1.5 text-sm ${entityFilter === f ? 'bg-primary text-white' : 'bg-surface-container-high'}`}>{f === '' ? 'All' : f}</button>)}</div>{isLoading ? <div className="h-20 animate-pulse rounded-xl bg-surface-container-high" /> : groups.length === 0 ? <div className="py-16 text-center text-on-surface-variant"><CheckCircle className="mx-auto mb-3 h-12 w-12" /><p>No pending duplicates</p></div> : <div className="space-y-3">{groups.map((group) => <div key={group.id} className="rounded-xl border border-outline-variant bg-surface p-4"><div className="flex items-center justify-between"><div className="text-sm font-semibold capitalize">{group.entityType} duplicate ({group.records.length})</div><div className="flex items-center gap-2"><button onClick={() => dismiss.mutate(group.id)} className="px-3 py-1.5 text-sm text-on-surface-variant">Not duplicates</button><button onClick={() => setMerging(group)} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm text-white"><GitMerge className="h-3.5 w-3.5" />Merge<ChevronRight className="h-3.5 w-3.5" /></button></div></div></div>)}</div>}</div>;}
