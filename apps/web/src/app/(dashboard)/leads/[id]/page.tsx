'use client';

import { useParams, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Activity, Note, PaginatedResult } from '@nexus/shared-types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useLead } from '@/hooks/use-leads';
import { useLeadNotes } from '@/hooks/use-notes';
import { useActivities } from '@/hooks/use-activities';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';

type LeadTab = 'activities' | 'notes' | 'score' | 'documents' | 'duplicates' | 'governance' | 'conversion';
type AnyRecord = Record<string, unknown>;

interface ScoreBreakdown {
  leadId: string;
  score: number;
  factors: Array<{ name: string; weight: number; contribution: number }>;
}

function unwrapRows<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: T[] }).data;
  }
  return [];
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;
  const [tab, setTab] = useState<LeadTab>('activities');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isDevPreview = process.env.NODE_ENV === 'development';
  const canRead = isDevPreview || hasPermission('leads:read');
  const canUpdate = isDevPreview || hasPermission('leads:update') || hasPermission('leads:*');
  const leadQuery = useLead(leadId);
  const notesQuery = useLeadNotes(leadId);
  const activitiesQuery = useActivities({ leadId, limit: 50 });

  const scoreQuery = useQuery<ScoreBreakdown>({
    queryKey: ['lead-scores', leadId],
    queryFn: () => api.get<ScoreBreakdown>(`/lead-scores/${leadId}`),
    enabled: Boolean(leadId) && tab === 'score',
  });

  const documentsQuery = useQuery<unknown>({
    queryKey: ['leads', leadId, 'documents'],
    queryFn: () => api.get<unknown>(`/leads/${leadId}/documents`),
    enabled: Boolean(leadId) && tab === 'documents',
  });

  const duplicatesQuery = useQuery<unknown>({
    queryKey: ['leads', leadId, 'duplicates'],
    queryFn: () => api.get<unknown>(`/leads/${leadId}/duplicates`),
    enabled: Boolean(leadId) && tab === 'duplicates',
  });

  const fieldHistoryQuery = useQuery<unknown>({
    queryKey: ['leads', leadId, 'field-history'],
    queryFn: () => api.get<unknown>(`/leads/${leadId}/field-history`),
    enabled: Boolean(leadId) && tab === 'governance',
  });

  const auditQuery = useQuery<unknown>({
    queryKey: ['leads', leadId, 'audit'],
    queryFn: () => api.get<unknown>(`/leads/${leadId}/audit`),
    enabled: Boolean(leadId) && tab === 'governance',
  });

  const outboxQuery = useQuery<unknown>({
    queryKey: ['leads', leadId, 'outbox'],
    queryFn: () => api.get<unknown>(`/leads/${leadId}/outbox`),
    enabled: Boolean(leadId) && tab === 'governance',
  });

  const uploadDocument = useMutation({
    mutationFn: (file: File) =>
      api.post(`/leads/${leadId}/documents`, {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        category: 'lead',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', leadId, 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['leads', leadId, 'audit'] });
    },
  });

  const lead = leadQuery.data;

  if (!canRead) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          You do not have permission to view leads.
        </div>
      </div>
    );
  }

  if (leadQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-64" />
      </div>
    );
  }

  if (leadQuery.isError || !lead) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load lead: {leadQuery.error instanceof Error ? leadQuery.error.message : 'Unknown error'}
        </div>
      </div>
    );
  }

  const tabs: { id: LeadTab; label: string }[] = [
    { id: 'activities', label: 'Activities' },
    { id: 'notes', label: 'Notes' },
    { id: 'score', label: 'Score' },
    { id: 'documents', label: 'Documents' },
    { id: 'duplicates', label: 'Duplicates' },
    { id: 'governance', label: 'Governance' },
    { id: 'conversion', label: 'Conversion' },
  ];
  const leadRecord = lead as unknown as AnyRecord;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {lead.firstName} {lead.lastName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {lead.company ?? '-'} | Score: {lead.score} | {lead.source}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canUpdate && <Button onClick={() => setTab('conversion')}>Convert</Button>}
          <Button variant="secondary" onClick={() => router.push('/leads')}>
            Back
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Lead Profile</h2>
            <dl className="space-y-2 text-sm">
              <DetailItem label="Code" value={String(leadRecord.code ?? '-')} />
              <DetailItem label="Email" value={lead.email ?? '-'} />
              <DetailItem label="Phone" value={lead.phone ?? '-'} />
              <DetailItem label="Source" value={lead.source} />
              <DetailItem label="Status" value={<StatusBadge status={lead.status} />} />
              <DetailItem label="Score" value={String(lead.score)} />
              <DetailItem label="Rating" value={String(leadRecord.rating ?? '-')} />
              <DetailItem label="Job Title" value={lead.jobTitle ?? '-'} />
              <DetailItem label="Company" value={lead.company ?? '-'} />
              <DetailItem label="Industry" value={String(leadRecord.industry ?? '-')} />
              <DetailItem label="Website" value={String(leadRecord.website ?? '-')} />
              <DetailItem label="Owner" value={lead.ownerId ?? '-'} />
              <DetailItem label="Territory" value={String(leadRecord.territoryId ?? '-')} />
              <DetailItem label="Assigned To" value={String(leadRecord.assignedTo ?? '-')} />
              <DetailItem label="Converted" value={lead.convertedAt ? formatDate(lead.convertedAt) : '-'} />
              <DetailItem label="Created" value={formatDate(lead.createdAt)} />
            </dl>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Readiness</h2>
            <div className="space-y-3 text-sm">
              <ReadinessItem label="Identity" ok={Boolean(lead.email || lead.phone)} />
              <ReadinessItem label="Company fit" ok={Boolean(lead.company && leadRecord.industry)} />
              <ReadinessItem label="Routing" ok={Boolean(lead.ownerId)} />
              <ReadinessItem label="Consent" ok={!leadRecord.doNotContact} />
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium',
                  tab === t.id
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'activities' && <ActivitiesTab data={activitiesQuery.data} isLoading={activitiesQuery.isLoading} />}
          {tab === 'notes' && <NotesTab data={notesQuery.data} isLoading={notesQuery.isLoading} />}
          {tab === 'score' && <ScoreTab data={scoreQuery.data} isLoading={scoreQuery.isLoading} />}
          {tab === 'documents' && (
            <DocumentsTab
              rows={unwrapRows<AnyRecord>(documentsQuery.data)}
              isLoading={documentsQuery.isLoading}
              canUpload={canUpdate}
              isUploading={uploadDocument.isPending}
              onPick={() => fileInputRef.current?.click()}
            />
          )}
          {tab === 'duplicates' && (
            <DuplicatesTab rows={unwrapRows<AnyRecord>(duplicatesQuery.data)} isLoading={duplicatesQuery.isLoading} />
          )}
          {tab === 'governance' && (
            <GovernanceTab
              fieldHistory={unwrapRows<AnyRecord>(fieldHistoryQuery.data)}
              audit={unwrapRows<AnyRecord>(auditQuery.data)}
              outbox={unwrapRows<AnyRecord>(outboxQuery.data)}
              isLoading={fieldHistoryQuery.isLoading || auditQuery.isLoading || outboxQuery.isLoading}
            />
          )}
          {tab === 'conversion' && <ConversionTab lead={lead as unknown as AnyRecord} canUpdate={canUpdate} />}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) uploadDocument.mutate(file);
          event.currentTarget.value = '';
        }}
      />
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-28 shrink-0 text-xs uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="flex-1 text-slate-700">{value}</dd>
    </div>
  );
}

function ReadinessItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
      <span className="font-medium text-slate-700">{label}</span>
      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
        {ok ? 'Ready' : 'Needs data'}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'CONVERTED'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'UNQUALIFIED'
        ? 'bg-red-100 text-red-700'
        : status === 'QUALIFIED'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-slate-100 text-slate-700';
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', color)}>{status}</span>;
}

function ActivitiesTab({ data, isLoading }: { data: PaginatedResult<Activity> | undefined; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-32" />;
  const items = data?.data ?? [];
  if (items.length === 0) return <EmptyState icon="calendar" title="No activities" description="No activities linked to this lead." />;
  return (
    <div className="space-y-3">
      {items.map((a) => (
        <div key={a.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">{a.subject}</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{a.status}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {a.type} | {a.dueDate ? formatDate(a.dueDate) : 'No due date'}
          </p>
        </div>
      ))}
    </div>
  );
}

function NotesTab({ data, isLoading }: { data: PaginatedResult<Note> | undefined; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-32" />;
  const notes = data?.data ?? [];
  if (notes.length === 0) return <EmptyState icon="note" title="No notes" description="No notes for this lead." />;
  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <div key={note.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="whitespace-pre-wrap text-sm text-slate-700">{note.content}</p>
          <div className="mt-2 text-xs text-slate-400">{formatDate(note.createdAt)}</div>
        </div>
      ))}
    </div>
  );
}

function ScoreTab({ data, isLoading }: { data: ScoreBreakdown | undefined; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-32" />;
  if (!data) return <EmptyState icon="chart" title="No score data" description="Score breakdown is not available for this lead." />;
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-900">Total Score</span>
          <span className="text-lg font-bold text-slate-900">{data.score}</span>
        </div>
      </div>
      {data.factors.map((f) => (
        <div key={f.name} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-900">{f.name}</span>
            <span className="text-sm text-slate-600">{f.contribution > 0 ? '+' : ''}{f.contribution}</span>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-slate-800" style={{ width: `${Math.min(100, Math.max(0, f.weight * 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DocumentsTab({ rows, isLoading, canUpload, isUploading, onPick }: { rows: AnyRecord[]; isLoading: boolean; canUpload: boolean; isUploading: boolean; onPick: () => void }) {
  if (isLoading) return <Skeleton className="h-32" />;
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Lead Documents</h3>
          <p className="text-xs text-slate-500">RFQs, intake files, qualification notes and imported proof.</p>
        </div>
        {canUpload && <Button onClick={onPick} disabled={isUploading}>{isUploading ? 'Uploading' : 'Upload'}</Button>}
      </div>
      {rows.length === 0 ? (
        <div className="p-4"><EmptyState icon="folder" title="No documents" description="Upload files connected to this lead." /></div>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((doc, index) => (
            <div key={String(doc.id ?? index)} className="flex items-center justify-between p-4 text-sm">
              <div>
                <p className="font-medium text-slate-900">{String(doc.fileName ?? doc.name ?? 'Document')}</p>
                <p className="text-xs text-slate-500">{String(doc.mimeType ?? doc.category ?? 'file')} | {String(doc.fileSize ?? doc.size ?? 0)} bytes</p>
              </div>
              <span className="text-xs text-slate-400">{doc.createdAt ? formatDate(String(doc.createdAt)) : '-'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DuplicatesTab({ rows, isLoading }: { rows: AnyRecord[]; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-32" />;
  if (rows.length === 0) return <EmptyState icon="verified" title="No duplicates found" description="This lead currently has no matching duplicate signals." />;
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={String(row.id ?? index)} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">{String(row.firstName ?? '')} {String(row.lastName ?? '')}</p>
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-700">Score {String(row.score ?? '-')}</span>
          </div>
          <p className="mt-1 text-xs text-slate-600">{String(row.email ?? '-')} | {String(row.company ?? '-')}</p>
          <p className="mt-2 text-xs font-medium text-amber-700">Signals: {Array.isArray(row.duplicateSignals) ? row.duplicateSignals.join(', ') : String(row.matchReason ?? '-')}</p>
        </div>
      ))}
    </div>
  );
}

function GovernanceTab({ fieldHistory, audit, outbox, isLoading }: { fieldHistory: AnyRecord[]; audit: AnyRecord[]; outbox: AnyRecord[]; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-48" />;
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <GovernanceList title="Field History" rows={fieldHistory} primary="fieldName" secondary="newValue" dateKey="changedAt" />
      <GovernanceList title="Audit Trail" rows={audit} primary="action" secondary="actor" dateKey="at" />
      <GovernanceList title="Outbox Events" rows={outbox} primary="type" secondary="status" dateKey="createdAt" />
    </div>
  );
}

function GovernanceList({ title, rows, primary, secondary, dateKey }: { title: string; rows: AnyRecord[]; primary: string; secondary: string; dateKey: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-3">
        {rows.length === 0 ? <p className="text-xs text-slate-500">No records yet.</p> : rows.slice(0, 8).map((row, index) => (
          <div key={String(row.id ?? index)} className="rounded-lg bg-slate-50 p-3 text-xs">
            <p className="font-semibold text-slate-800">{String(row[primary] ?? row.description ?? '-')}</p>
            <p className="mt-1 text-slate-500">{String(row[secondary] ?? '-')}</p>
            <p className="mt-1 text-slate-400">{row[dateKey] ? formatDate(String(row[dateKey])) : '-'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConversionTab({ lead, canUpdate }: { lead: AnyRecord; canUpdate: boolean }) {
  const converted = Boolean(lead.convertedAt);
  const rows = [
    ['Account', lead.convertedToAccountId ?? lead.convertedToId ?? 'Ready to create or link'],
    ['Contact', lead.convertedToContactId ?? 'Ready to create'],
    ['Deal', lead.convertedToDealId ?? 'Optional from conversion policy'],
    ['Policy', 'Validation rules, duplicate scan and routing must pass before conversion'],
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Conversion Control</h3>
          <p className="mt-1 text-xs text-slate-500">Lead conversion writes account, contact and optional deal in one governed transaction.</p>
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', converted ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700')}>
          {converted ? 'Converted' : 'Ready'}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={String(label)} className="rounded-lg bg-slate-50 p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{String(label)}</dt>
            <dd className="mt-1 text-sm font-medium text-slate-800">{String(value)}</dd>
          </div>
        ))}
      </dl>
      {!canUpdate && <p className="mt-4 text-xs text-amber-700">Your role can view this conversion logic but cannot execute conversion.</p>}
    </div>
  );
}
