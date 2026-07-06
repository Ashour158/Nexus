'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Note, PaginatedResult, TimelineEvent } from '@nexus/shared-types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CallButton } from '@/components/crm/call-button';
import { AiPredictionPanel } from '@/components/crm/AiPredictionPanel';
import { timelineMeta } from '@/lib/timeline-icons';
import { useDeal, useDealTimeline, useDealScoringInsights } from '@/hooks/use-deals';
import { useUsers } from '@/hooks/use-users';
import type { DealHealth, DealScoringInsights } from '@/hooks/use-deals';
import { useDealNotes } from '@/hooks/use-notes';
import { api } from '@/lib/api-client';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';

type DealTab = 'health' | 'timeline' | 'notes' | 'cpq' | 'orders' | 'documents' | 'stakeholders' | 'governance' | 'competitors';
type AnyRecord = Record<string, unknown>;

interface Stakeholder {
  id: string;
  name: string;
  role: string;
  email: string | null;
  influence: string;
}

interface Competitor {
  id: string;
  name: string;
  strength: string | null;
  threatLevel: string | null;
}

function unwrapRows<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: T[] }).data;
  }
  return [];
}

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.id as string;
  const [tab, setTab] = useState<DealTab>('health');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isDevPreview = process.env.NODE_ENV === 'development';
  const canRead = isDevPreview || hasPermission('deals:read');
  const canUpdate = isDevPreview || hasPermission('deals:update') || hasPermission('deals:*');
  const dealQuery = useDeal(dealId);
  const timelineQuery = useDealTimeline(dealId);
  const insightsQuery = useDealScoringInsights(dealId);
  const notesQuery = useDealNotes(dealId, { limit: 50 });
  const usersQuery = useUsers({ limit: 100 });

  const stakeholdersQuery = useQuery<{ data: Stakeholder[] }>({
    queryKey: ['deals', dealId, 'stakeholders'],
    queryFn: () => api.get<{ data: Stakeholder[] }>(`/deals/${dealId}/stakeholders`),
    enabled: Boolean(dealId) && tab === 'stakeholders',
  });

  const competitorsQuery = useQuery<{ data: Competitor[] }>({
    queryKey: ['deals', dealId, 'competitors'],
    queryFn: () => api.get<{ data: Competitor[] }>(`/deals/${dealId}/competitors`),
    enabled: Boolean(dealId) && tab === 'competitors',
  });

  const quotesQuery = useQuery<unknown>({
    queryKey: ['deals', dealId, 'quotes'],
    queryFn: () => api.get<unknown>(`/deals/${dealId}/quotes`),
    enabled: Boolean(dealId) && tab === 'cpq',
  });

  const ordersQuery = useQuery<unknown>({
    queryKey: ['deals', dealId, 'orders'],
    queryFn: () => api.get<unknown>(`/deals/${dealId}/orders`),
    enabled: Boolean(dealId) && tab === 'orders',
  });

  const documentsQuery = useQuery<unknown>({
    queryKey: ['deals', dealId, 'documents'],
    queryFn: () => api.get<unknown>(`/deals/${dealId}/documents`),
    enabled: Boolean(dealId) && tab === 'documents',
  });

  const fieldHistoryQuery = useQuery<unknown>({
    queryKey: ['deals', dealId, 'field-history'],
    queryFn: () => api.get<unknown>(`/deals/${dealId}/field-history`),
    enabled: Boolean(dealId) && tab === 'governance',
  });

  const auditQuery = useQuery<unknown>({
    queryKey: ['deals', dealId, 'audit'],
    queryFn: () => api.get<unknown>(`/deals/${dealId}/audit`),
    enabled: Boolean(dealId) && tab === 'governance',
  });

  const outboxQuery = useQuery<unknown>({
    queryKey: ['deals', dealId, 'outbox'],
    queryFn: () => api.get<unknown>(`/deals/${dealId}/outbox`),
    enabled: Boolean(dealId) && tab === 'governance',
  });

  const uploadDocument = useMutation({
    mutationFn: (file: File) =>
      api.post(`/deals/${dealId}/documents`, {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        category: 'deal',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deals', dealId, 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['deals', dealId, 'audit'] });
    },
  });

  const deal = dealQuery.data;

  if (!canRead) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          You do not have permission to view deals.
        </div>
      </div>
    );
  }

  if (dealQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-64" />
      </div>
    );
  }

  if (dealQuery.isError || !deal) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load deal: {dealQuery.error instanceof Error ? dealQuery.error.message : 'Unknown error'}
        </div>
      </div>
    );
  }

  const tabs: { id: DealTab; label: string }[] = [
    { id: 'health', label: 'Health' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'notes', label: 'Notes' },
    { id: 'cpq', label: 'CPQ / Quotes' },
    { id: 'orders', label: 'Orders' },
    { id: 'documents', label: 'Documents' },
    { id: 'stakeholders', label: 'Stakeholders' },
    { id: 'governance', label: 'Governance' },
    { id: 'competitors', label: 'Competitors' },
  ];

  const dealRecord = deal as unknown as AnyRecord;
  const stageRecord = dealRecord.stage && typeof dealRecord.stage === 'object' ? dealRecord.stage as AnyRecord : {};
  const accountRecord = dealRecord.account && typeof dealRecord.account === 'object' ? dealRecord.account as AnyRecord : {};
  const stageName = String(stageRecord.name ?? deal.stageId);
  const accountName = String(accountRecord.name ?? dealRecord.accountName ?? deal.accountId);
  const ownerRecord = dealRecord.owner && typeof dealRecord.owner === 'object' ? dealRecord.owner as AnyRecord : {};
  const ownerFromList = (usersQuery.data?.data ?? []).find((u) => u.id === deal.ownerId);
  const ownerName = String(
    ownerRecord.name ??
      (ownerRecord.firstName ? `${ownerRecord.firstName} ${ownerRecord.lastName ?? ''}`.trim() : undefined) ??
      dealRecord.ownerName ??
      (ownerFromList ? ownerFromList.name || `${ownerFromList.firstName ?? ''} ${ownerFromList.lastName ?? ''}`.trim() || ownerFromList.email : undefined) ??
      deal.ownerId,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{deal.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {deal.status} | {stageName} | {formatCurrency(deal.amount, deal.currency)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => router.push('/deals')}>Back</Button>
          <CallButton dealId={dealId} accountId={deal.accountId ?? undefined} />
          {canUpdate && <Button onClick={() => router.push(`/deals/${dealId}/edit`)}>Edit</Button>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Deal Control</h2>
            <dl className="space-y-2 text-sm">
              <DetailItem label="Code" value={String(dealRecord.code ?? '-')} />
              <DetailItem label="Value" value={formatCurrency(deal.amount, deal.currency)} />
              <DetailItem label="Stage" value={stageName} />
              <DetailItem label="Status" value={<StatusBadge status={deal.status} />} />
              <DetailItem label="Probability" value={`${deal.probability}%`} />
              <DetailItem label="Owner" value={ownerName} />
              <DetailItem label="Account" value={<Link href={`/accounts/${deal.accountId}`} className="text-brand-700 hover:underline">{accountName}</Link>} />
              <DetailItem label="Close Date" value={deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : '-'} />
              <DetailItem label="Forecast" value={deal.forecastCategory} />
              <DetailItem label="MEDDIC" value={String(dealRecord.meddicicScore ?? '-')} />
              <DetailItem label="Created" value={formatDate(deal.createdAt)} />
            </dl>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Stage Hardening</h2>
            <div className="space-y-3 text-sm">
              <ReadinessItem label="Account linked" ok={Boolean(deal.accountId)} />
              <ReadinessItem label="Pipeline active" ok={Boolean(deal.pipelineId && deal.stageId)} />
              <ReadinessItem label="Expected close" ok={Boolean(deal.expectedCloseDate)} />
              <ReadinessItem label="Commercial value" ok={Number(deal.amount) > 0} />
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

          {tab === 'health' && (
            <HealthTab
              data={insightsQuery.data}
              isLoading={insightsQuery.isLoading}
              isError={insightsQuery.isError}
            />
          )}
          {tab === 'timeline' && <TimelineTab data={timelineQuery.data} isLoading={timelineQuery.isLoading} />}
          {tab === 'notes' && (
            <NotesTab
              data={notesQuery.data}
              isLoading={notesQuery.isLoading}
              error={notesQuery.error}
            />
          )}
          {tab === 'cpq' && <CommercialTab title="Quotes" rows={unwrapRows<AnyRecord>(quotesQuery.data)} isLoading={quotesQuery.isLoading} />}
          {tab === 'orders' && <CommercialTab title="Orders" rows={unwrapRows<AnyRecord>(ordersQuery.data)} isLoading={ordersQuery.isLoading} />}
          {tab === 'documents' && (
            <DocumentsTab
              rows={unwrapRows<AnyRecord>(documentsQuery.data)}
              isLoading={documentsQuery.isLoading}
              canUpload={canUpdate}
              isUploading={uploadDocument.isPending}
              onPick={() => fileInputRef.current?.click()}
            />
          )}
          {tab === 'stakeholders' && <StakeholdersTab data={stakeholdersQuery.data} isLoading={stakeholdersQuery.isLoading} />}
          {tab === 'governance' && (
            <GovernanceTab
              fieldHistory={unwrapRows<AnyRecord>(fieldHistoryQuery.data)}
              audit={unwrapRows<AnyRecord>(auditQuery.data)}
              outbox={unwrapRows<AnyRecord>(outboxQuery.data)}
              isLoading={fieldHistoryQuery.isLoading || auditQuery.isLoading || outboxQuery.isLoading}
            />
          )}
          {tab === 'competitors' && <CompetitorsTab data={competitorsQuery.data} isLoading={competitorsQuery.isLoading} />}
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
    status === 'WON'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'LOST'
        ? 'bg-red-100 text-red-700'
        : status === 'DORMANT'
          ? 'bg-slate-100 text-slate-700'
          : 'bg-blue-100 text-blue-700';
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', color)}>{status}</span>;
}

const HEALTH_META: Record<DealHealth, { label: string; score: number; badge: string; bar: string }> = {
  healthy: { label: 'Healthy', score: 90, badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  at_risk: { label: 'At risk', score: 55, badge: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500' },
  stalled: { label: 'Stalled', score: 35, badge: 'bg-orange-100 text-orange-700', bar: 'bg-orange-500' },
  won: { label: 'Won', score: 100, badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  lost: { label: 'Lost', score: 0, badge: 'bg-red-100 text-red-700', bar: 'bg-red-500' },
};

function HealthTab({ data, isLoading, isError }: { data: DealScoringInsights | undefined; isLoading: boolean; isError: boolean }) {
  if (isLoading) return <Skeleton className="h-48" />;
  if (isError || !data) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Deal health could not be computed right now. It is derived from the deal&apos;s stage age, MEDDIC coverage,
        data quality and recent activity.
      </div>
    );
  }
  const meta = HEALTH_META[data.health] ?? HEALTH_META.at_risk;
  // The service returns a categorical `health`; fall back to a label-derived
  // score when no numeric `healthScore` is provided.
  const score = data.healthScore ?? meta.score;
  const s = data.signals ?? {};

  const signalRows: Array<{ label: string; value: string }> = [
    { label: 'Stage', value: s.stageName ?? String(s.stageId ?? '-') },
    { label: 'Stage age', value: s.stageAgeDays != null ? `${s.stageAgeDays} days` : '-' },
    { label: 'Rotten limit', value: s.rottenDays != null ? `${s.rottenDays} days` : 'Not set' },
    { label: 'Last activity', value: s.daysSinceLastActivity != null ? `${s.daysSinceLastActivity} days ago` : 'None logged' },
    { label: 'Data quality', value: s.dataQualityScore != null ? `${s.dataQualityScore}%` : 'Not scored' },
    { label: 'MEDDIC', value: s.meddicScore != null ? `${s.meddicScore}` : 'Not scored' },
    { label: 'Probability', value: s.probability != null ? `${s.probability}%` : '-' },
  ];

  return (
    <div className="space-y-4">
      {data.ai ? (
        <AiPredictionPanel
          probability={data.ai.winProbability}
          score={data.ai.score}
          insights={data.ai.insights}
          kind="win prediction"
        />
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Deal Health</h3>
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', meta.badge)}>{meta.label}</span>
        </div>
        <div className="mt-3 flex items-end gap-2">
          <span className="text-4xl font-bold text-slate-900">{score}</span>
          <span className="pb-1 text-sm text-slate-400">/ 100</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={cn('h-full rounded-full', meta.bar)} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
        </div>
        {s.isRotten ? (
          <p className="mt-3 text-xs font-medium text-orange-600">This deal has exceeded its stage rotten-day limit.</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Signals</h3>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {signalRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between border-b border-slate-50 py-1 text-sm">
              <dt className="text-slate-500">{row.label}</dt>
              <dd className="font-medium text-slate-800">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Recommendations</h3>
        {data.recommendations.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No action needed — this deal looks on track.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.recommendations.map((rec, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TimelineTab({ data, isLoading }: { data: PaginatedResult<TimelineEvent> | undefined; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-32" />;
  const events = data?.data ?? [];
  if (events.length === 0) return <EmptyState icon="timeline" title="No timeline events" description="Activities, quotes and stage changes will appear here." />;
  return (
    <div className="space-y-3">
      {events.map((evt) => {
        const meta = timelineMeta(evt as unknown as Record<string, unknown>);
        return (
          <div key={evt.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                {meta.icon}
                {evt.title}
              </p>
              <span className="text-xs text-slate-400">{formatDateTime(evt.at)}</span>
            </div>
            {evt.description && <p className="mt-1 text-xs text-slate-500">{evt.description}</p>}
            <span className="mt-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{meta.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function NotesTab({
  data,
  isLoading,
  error,
}: {
  data: PaginatedResult<Note> | undefined;
  isLoading: boolean;
  error?: Error | null;
}) {
  if (isLoading) return <Skeleton className="h-32" />;
  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Notes could not be loaded right now. The deal record and linked commercial data are still available.
      </div>
    );
  }
  const notes = data?.data ?? [];
  if (notes.length === 0) return <EmptyState icon="note" title="No notes" description="Add notes to keep track of important details." />;
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

function CommercialTab({ title, rows, isLoading }: { title: string; rows: AnyRecord[]; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-32" />;
  if (rows.length === 0) return <EmptyState icon="table" title={`No ${title.toLowerCase()}`} description={`${title} linked to this deal will appear here.`} />;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={String(row.id ?? index)}>
                <td className="px-4 py-3 font-medium text-slate-900">{String(row.quoteNumber ?? row.orderNumber ?? row.code ?? row.id ?? '-')}</td>
                <td className="px-4 py-3">{String(row.status ?? '-')}</td>
                <td className="px-4 py-3">{String(row.total ?? row.grandTotal ?? row.amount ?? '-')} {String(row.currency ?? '')}</td>
                <td className="px-4 py-3 text-slate-500">{row.updatedAt ? formatDate(String(row.updatedAt)) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocumentsTab({ rows, isLoading, canUpload, isUploading, onPick }: { rows: AnyRecord[]; isLoading: boolean; canUpload: boolean; isUploading: boolean; onPick: () => void }) {
  if (isLoading) return <Skeleton className="h-32" />;
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Deal Documents</h3>
          <p className="text-xs text-slate-500">RFQs, quote templates, purchase files and approval proof.</p>
        </div>
        {canUpload && <Button onClick={onPick} disabled={isUploading}>{isUploading ? 'Uploading' : 'Upload'}</Button>}
      </div>
      {rows.length === 0 ? (
        <div className="p-4"><EmptyState icon="folder" title="No documents" description="Upload files connected to this deal." /></div>
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

function StakeholdersTab({ data, isLoading }: { data: { data: Stakeholder[] } | undefined; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-32" />;
  const items = data?.data ?? [];
  if (items.length === 0) return <EmptyState icon="people" title="No stakeholders" description="Add stakeholders to track decision makers." />;
  return (
    <div className="space-y-3">
      {items.map((s) => (
        <div key={s.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">{s.name}</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{s.influence}</span>
          </div>
          <p className="text-xs text-slate-500">{s.role}</p>
          {s.email && <p className="text-xs text-slate-400">{s.email}</p>}
        </div>
      ))}
    </div>
  );
}

function CompetitorsTab({ data, isLoading }: { data: { data: Competitor[] } | undefined; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-32" />;
  const items = data?.data ?? [];
  if (items.length === 0) return <EmptyState icon="market" title="No competitors" description="Track competitors and threat levels for this deal." />;
  return (
    <div className="space-y-3">
      {items.map((c) => (
        <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">{c.name}</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{c.threatLevel ?? '-'}</span>
          </div>
          {c.strength && <p className="text-xs text-slate-500">{c.strength}</p>}
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
