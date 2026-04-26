'use client';

import Link from 'next/link';
import { useMemo, useState, type JSX } from 'react';
import { useParams } from 'next/navigation';
import { useLead, useConvertLead } from '@/hooks/use-leads';
import { usePipelines, useStages } from '@/hooks/use-pipelines';
import { useActivities, useCreateActivity, useCompleteActivity } from '@/hooks/use-activities';
import { useLeadNotes, useCreateNote } from '@/hooks/use-notes';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { formatDate, formatDateTime } from '@/lib/format';

type Tab = 'overview' | 'activities' | 'notes' | 'convert';

export default function LeadDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [tab, setTab] = useState<Tab>('overview');
  const pushToast = useUiStore((s) => s.pushToast);
  const userId = useAuthStore((s) => s.userId);

  const leadQuery = useLead(id);
  const lead = leadQuery.data;
  const convert = useConvertLead();
  const pipelines = usePipelines();
  const [pipelineId, setPipelineId] = useState('');
  const stages = useStages(pipelineId || null);

  const activitiesQuery = useActivities({ leadId: id, limit: 50, page: 1 });
  const createActivity = useCreateActivity();
  const completeActivity = useCompleteActivity();
  const notesQuery = useLeadNotes(id);
  const createNote = useCreateNote();

  const [accountMode, setAccountMode] = useState<'new' | 'existing'>('new');
  const [accountName, setAccountName] = useState('');
  const [existingAccountId, setExistingAccountId] = useState('');
  const [createDeal, setCreateDeal] = useState(true);
  const [dealName, setDealName] = useState('');
  const [dealAmount, setDealAmount] = useState('');
  const [createdResult, setCreatedResult] = useState<{
    contactId: string;
    accountId: string;
    dealId?: string;
  } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [activitySubject, setActivitySubject] = useState('');

  useMemo(() => {
    if (!lead) return;
    setAccountName(lead.company ?? '');
    setDealName(`Opportunity - ${lead.company ?? `${lead.firstName} ${lead.lastName}`}`);
  }, [lead]);

  if (leadQuery.isLoading) return <div className="p-6 text-sm text-slate-500">Loading lead…</div>;
  if (!lead) return <div className="p-6 text-sm text-red-600">Lead not found.</div>;

  const activities = activitiesQuery.data?.data ?? [];
  const notes = notesQuery.data?.data ?? [];

  async function onConvert(): Promise<void> {
    try {
      const result = await convert.mutateAsync({
        id,
        accountName: accountMode === 'new' ? accountName : undefined,
        accountId: accountMode === 'existing' ? existingAccountId : undefined,
        createDeal,
        dealName: createDeal ? dealName : undefined,
        dealAmount: createDeal && dealAmount ? Number(dealAmount) : undefined,
        pipelineId: createDeal && pipelineId ? pipelineId : undefined,
      } as {
        id: string;
        accountName?: string;
        accountId?: string;
        createDeal?: boolean;
        dealName?: string;
        dealAmount?: number;
        pipelineId?: string;
      });
      setCreatedResult(result);
      pushToast({ variant: 'success', title: 'Lead converted' });
    } catch (err) {
      pushToast({
        variant: 'error',
        title: 'Conversion failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return (
    <main className="space-y-4 px-6 py-6">
      <header>
        <div className="text-sm text-slate-500">
          <Link href="/leads" className="hover:text-slate-700">Leads</Link> / {lead.firstName} {lead.lastName}
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{lead.firstName} {lead.lastName}</h1>
      </header>

      <div className="flex gap-1 border-b border-slate-200">
        {(['overview', 'activities', 'notes', 'convert'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? 'border-slate-900 font-semibold' : 'border-transparent text-slate-500'}`}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" value={`${lead.firstName} ${lead.lastName}`} />
          <Field label="Email" value={lead.email ?? '—'} />
          <Field label="Phone" value={lead.phone ?? '—'} />
          <Field label="Company" value={lead.company ?? '—'} />
          <Field label="Job Title" value={lead.jobTitle ?? '—'} />
          <Field label="Source" value={lead.source} />
          <Field label="Status" value={lead.status} />
          <Field label="Score" value={String(lead.score)} />
          <Field label="Owner" value={lead.ownerId ? lead.ownerId.slice(0, 8) : '—'} />
          <Field label="Created" value={formatDate(lead.createdAt)} />
        </section>
      )}

      {tab === 'activities' && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex gap-2">
            <input className="h-9 flex-1 rounded border border-slate-200 px-3 text-sm" value={activitySubject} onChange={(e) => setActivitySubject(e.target.value)} placeholder="Add activity subject" />
            <button
              className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
              onClick={() => {
                if (!activitySubject.trim() || !userId) return;
                createActivity.mutate({
                  type: 'TASK',
                  subject: activitySubject.trim(),
                  ownerId: userId,
                  leadId: id,
                  priority: 'NORMAL',
                  customFields: {},
                });
                setActivitySubject('');
              }}
            >
              Add
            </button>
          </div>
          <ul className="space-y-2">
            {activities.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{a.subject}</p>
                  <p className="text-xs text-slate-500">{a.status} · {formatDateTime(a.dueDate)}</p>
                </div>
                {a.status !== 'COMPLETED' ? (
                  <button className="rounded border border-slate-200 px-2 py-1 text-xs" onClick={() => completeActivity.mutate({ id: a.id, outcome: 'Completed' })}>Complete</button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'notes' && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <textarea className="w-full rounded border border-slate-200 p-2 text-sm" rows={3} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add note..." />
          <button className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white" onClick={() => {
            if (!noteText.trim()) return;
            createNote.mutate({ content: noteText.trim(), leadId: id, isPinned: false });
            setNoteText('');
          }}>Save note</button>
          <ul className="space-y-2">
            {notes.map((n) => <li key={n.id} className="rounded border border-slate-200 p-3 text-sm">{n.content}<div className="mt-1 text-xs text-slate-500">{formatDateTime(n.createdAt)}</div></li>)}
          </ul>
        </section>
      )}

      {tab === 'convert' && (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="space-y-2 text-sm">
            <label className="mr-4"><input type="radio" checked={accountMode === 'new'} onChange={() => setAccountMode('new')} /> Create new account</label>
            <label><input type="radio" checked={accountMode === 'existing'} onChange={() => setAccountMode('existing')} /> Use existing account</label>
          </div>
          {accountMode === 'new' ? (
            <input className="h-9 w-full rounded border border-slate-200 px-3 text-sm" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Account name" />
          ) : (
            <input className="h-9 w-full rounded border border-slate-200 px-3 text-sm" value={existingAccountId} onChange={(e) => setExistingAccountId(e.target.value)} placeholder="Existing account ID" />
          )}
          <label className="block text-sm"><input type="checkbox" checked={createDeal} onChange={(e) => setCreateDeal(e.target.checked)} /> Create deal</label>
          {createDeal ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <select className="h-9 rounded border border-slate-200 px-2 text-sm" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                <option value="">Select pipeline</option>
                {(pipelines.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="h-9 rounded border border-slate-200 px-2 text-sm">
                <option value="">Stage (auto by backend)</option>
                {(stages.data ?? []).map((s) => <option key={s.id}>{s.name}</option>)}
              </select>
              <input className="h-9 rounded border border-slate-200 px-3 text-sm sm:col-span-2" value={dealName} onChange={(e) => setDealName(e.target.value)} placeholder="Deal name" />
              <input className="h-9 rounded border border-slate-200 px-3 text-sm" type="number" value={dealAmount} onChange={(e) => setDealAmount(e.target.value)} placeholder="Deal amount" />
            </div>
          ) : null}
          <button className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white" onClick={() => void onConvert()} disabled={convert.isPending}>
            {convert.isPending ? 'Converting…' : 'Convert Lead'}
          </button>
          {createdResult ? (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Converted successfully. <Link className="underline" href={`/contacts/${createdResult.contactId}`}>Contact</Link> · <Link className="underline" href={`/accounts/${createdResult.accountId}`}>Account</Link> {createdResult.dealId ? <>· <Link className="underline" href={`/deals/${createdResult.dealId}`}>Deal</Link></> : null}
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-900">{value}</p>
    </div>
  );
}
