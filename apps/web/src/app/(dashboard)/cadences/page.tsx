'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Clock3, MailCheck, PauseCircle, Plus, RefreshCw, Route, Send, Users } from 'lucide-react';
import { apiClients } from '@/lib/api-client';
import {
  CRMCard,
  CRMEmptyState,
  CRMMetricCard,
  CRMMetricGrid,
  CRMModuleShell,
  CRMPageHeader,
  CRMStatusBadge,
  CRMTableShell,
  CRMToolbar,
} from '@/components/ui/crm';

type Cadence = {
  id: string;
  name: string;
  objectType: 'CONTACT' | 'LEAD';
  stepCount?: number;
  enrollmentCount?: number;
  isActive: boolean;
  description?: string | null;
};

export default function CadencesPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [objectType, setObjectType] = useState<'CONTACT' | 'LEAD'>('CONTACT');
  const [filter, setFilter] = useState<'ALL' | 'CONTACT' | 'LEAD'>('ALL');

  const cadences = useQuery({
    queryKey: ['cadences'],
    queryFn: () => apiClients.cadence.get<Cadence[]>('/cadences'),
    retry: 1,
  });

  const create = useMutation({
    mutationFn: () =>
      apiClients.cadence.post('/cadences', {
        name: name.trim(),
        description: description.trim() || undefined,
        objectType,
        exitOnReply: true,
        exitOnMeeting: true,
        steps: [{ position: 0, type: 'WAIT', delayDays: 0 }],
      }),
    onSuccess: async () => {
      setName('');
      setDescription('');
      await qc.invalidateQueries({ queryKey: ['cadences'] });
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClients.cadence.patch(`/cadences/${id}`, { isActive }),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['cadences'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClients.cadence.delete(`/cadences/${id}`),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['cadences'] }),
  });

  const rows = useMemo(() => cadences.data ?? [], [cadences.data]);
  const filteredRows = useMemo(
    () => rows.filter((row) => filter === 'ALL' || row.objectType === filter),
    [filter, rows]
  );
  const active = useMemo(() => rows.filter((row) => row.isActive).length, [rows]);
  const enrollments = useMemo(() => rows.reduce((sum, row) => sum + (row.enrollmentCount ?? 0), 0), [rows]);
  const leadCadences = rows.filter((row) => row.objectType === 'LEAD').length;
  const contactCadences = rows.filter((row) => row.objectType === 'CONTACT').length;

  return (
    <CRMModuleShell>
      <CRMPageHeader
        eyebrow="Engagement engine"
        icon={Route}
        title="Cadence Sequences"
        description="Govern outbound lead and contact sequences with pause/resume controls, enrollment visibility, and service-owned execution state."
        badges={
          <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
            Reply and meeting exits enabled
          </span>
        }
        metrics={
          <CRMMetricGrid>
            <CRMMetricCard icon={MailCheck} label="Active" value={active} tone="emerald" />
            <CRMMetricCard icon={Users} label="Enrolled" value={enrollments} tone="blue" />
            <CRMMetricCard icon={Activity} label="Lead flows" value={leadCadences} tone="amber" />
            <CRMMetricCard icon={Clock3} label="Contact flows" value={contactCadences} tone="slate" />
          </CRMMetricGrid>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => void qc.invalidateQueries({ queryKey: ['cadences'] })}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <Link href="/cadences/enroll" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#137fec] px-4 text-sm font-bold text-white hover:bg-[#005baf]">
              <Send className="h-4 w-4" />
              Quick enroll
            </Link>
          </>
        }
      />

      <CRMToolbar>
        <div className="grid w-full gap-3 lg:grid-cols-[1.2fr_1.4fr_180px_180px]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Cadence name"
            className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
            className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
          <select
            value={objectType}
            onChange={(event) => setObjectType(event.target.value as 'CONTACT' | 'LEAD')}
            className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <option value="CONTACT">Contacts</option>
            <option value="LEAD">Leads</option>
          </select>
          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#137fec] px-4 text-sm font-bold text-white hover:bg-[#005baf] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {create.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </CRMToolbar>

      <div className="flex flex-wrap gap-2">
        {(['ALL', 'CONTACT', 'LEAD'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
              filter === item
                ? 'bg-[#137fec] text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-[#005baf]'
            }`}
          >
            {item === 'ALL' ? 'All cadences' : item === 'CONTACT' ? 'Contacts' : 'Leads'}
          </button>
        ))}
      </div>

      <CRMCard title="Sequence Registry" description="Cadence state is controlled here; enrollment execution remains with the cadence service." padded={false}>
        <CRMTableShell className="rounded-none border-0 shadow-none">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Steps</th>
                <th className="px-5 py-3">Enrolled</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <Link href={`/cadences/${row.id}`} className="font-bold text-slate-950 hover:text-[#005baf]">
                      {row.name}
                    </Link>
                    {row.description ? <p className="mt-1 text-xs text-slate-500">{row.description}</p> : null}
                  </td>
                  <td className="px-5 py-4">
                    <CRMStatusBadge tone={row.objectType === 'LEAD' ? 'amber' : 'blue'}>{row.objectType}</CRMStatusBadge>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{row.stepCount ?? 0}</td>
                  <td className="px-5 py-4 text-slate-600">{row.enrollmentCount ?? 0}</td>
                  <td className="px-5 py-4">
                    <CRMStatusBadge tone={row.isActive ? 'emerald' : 'slate'}>{row.isActive ? 'Active' : 'Paused'}</CRMStatusBadge>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={() => toggle.mutate({ id: row.id, isActive: !row.isActive })}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <PauseCircle className="h-4 w-4" />
                        {row.isActive ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove.mutate(row.id)}
                        className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <CRMEmptyState
                      icon={Route}
                      title={cadences.isLoading ? 'Loading cadences...' : 'No cadences found'}
                      description="Create a contact or lead sequence to start controlled engagement."
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CRMTableShell>
      </CRMCard>
    </CRMModuleShell>
  );
}
