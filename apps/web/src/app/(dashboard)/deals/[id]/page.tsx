'use client';

/**
 * Deal detail — full 360° view (Overview, Timeline, Activities, Notes, Quotes).
 * @see CURSOR_FIX_DEAL_DETAIL.md
 */

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type JSX,
} from 'react';
import { useParams } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Deal, Note, PaginatedResult, TimelineEvent } from '@nexus/shared-types';
import type { CreateActivityInput } from '@nexus/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DealMeddicicForm } from '@/components/deals/deal-meddic-form';
import {
  dealKeys,
  useDeal,
  useMarkDealLost,
  useMarkDealWon,
  useMoveDeal,
  useUpdateDeal,
} from '@/hooks/use-deals';
import {
  activityKeys,
  useDealActivities,
  useCreateActivity,
  useCompleteActivity,
  useDeleteActivity,
} from '@/hooks/use-activities';
import {
  useCreateNote,
  useDealNotes,
  useDeleteNote,
  usePinNote,
  useUpdateNote,
} from '@/hooks/use-notes';
import {
  quoteKeys,
  useDealQuotes,
  useDuplicateQuote,
  useSendQuote,
  useVoidQuote,
} from '@/hooks/use-quotes';
import { useContacts } from '@/hooks/use-contacts';
import { useStages } from '@/hooks/use-pipelines';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api-client';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { ProductLineItems } from '@/components/deals/ProductLineItems';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { DiscountApprovalBanner } from '@/components/deals/DiscountApprovalBanner';

type TabId =
  | 'overview'
  | 'timeline'
  | 'activities'
  | 'contacts'
  | 'products'
  | 'documents'
  | 'emails'
  | 'approval'
  | 'notes'
  | 'quotes';

type DealWithRelations = Deal & {
  account?: {
    id: string;
    name: string;
    website?: string | null;
    industry?: string | null;
    annualRevenue?: string | number | null;
    tier?: string | null;
  };
  stage?: { id: string; name: string; order?: number; probability?: number };
  pipeline?: { id: string; name: string; stages?: Array<{ id: string; name: string; order: number }> };
  owner?: { id: string; firstName?: string; lastName?: string };
  contacts?: Array<{
    id?: string;
    role?: string | null;
    isPrimary?: boolean;
    contactId?: string;
    contact?: {
      id: string;
      firstName: string;
      lastName: string;
      email?: string | null;
      title?: string | null;
    };
  }>;
};

const LOST_REASONS = [
  'PRICE',
  'COMPETITION',
  'NO_BUDGET',
  'NO_DECISION',
  'TIMING',
  'OTHER',
] as const;

const FORECAST_OPTIONS = [
  'PIPELINE',
  'BEST_CASE',
  'COMMIT',
  'CLOSED',
  'OMITTED',
] as const;

function hashHue(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = name.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 55% 42%)`;
}

function initials(first: string, last: string): string {
  const a = (first || '?').slice(0, 1).toUpperCase();
  const b = (last || '').slice(0, 1).toUpperCase();
  return `${a}${b || a}`;
}

function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (Number.isNaN(diffMs)) return '—';
  const abs = Math.abs(diffMs);
  const mins = Math.floor(abs / 60_000);
  const hours = Math.floor(abs / 3_600_000);
  const days = Math.floor(abs / 86_400_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function activityIsOpen(status: string): boolean {
  return status === 'PLANNED' || status === 'IN_PROGRESS' || status === 'DEFERRED';
}

function normalizeWebsite(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const u = url.trim();
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  return `https://${u}`;
}

export default function DealDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const dealId = params?.id ?? '';
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.userId);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const roles = useAuthStore((s) => s.roles);

  const dealQuery = useDeal(dealId);
  const deal = dealQuery.data as DealWithRelations | undefined;

  const timelineInfinite = useInfiniteQuery({
    queryKey: [...dealKeys.timeline(dealId), 'paged'] as const,
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === 'number' ? pageParam : 1;
      return api.get<PaginatedResult<TimelineEvent>>(`/deals/${dealId}/timeline`, {
        params: { page, limit: 20 },
      });
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNextPage ? last.page + 1 : undefined),
    enabled: Boolean(dealId && deal),
  });

  const activitiesQuery = useDealActivities(dealId, { limit: 100, page: 1 });
  const notesQuery = useDealNotes(dealId, { limit: 100 });
  const quotesQuery = useDealQuotes(dealId);

  const stagesFromPipeline = useMemo(() => {
    const s = deal?.pipeline?.stages;
    if (Array.isArray(s) && s.length > 0) {
      return [...s].sort((a, b) => a.order - b.order);
    }
    return null;
  }, [deal]);

  const stagesQuery = useStages(deal?.pipelineId);
  const stageList = stagesFromPipeline ?? stagesQuery.data ?? [];

  const moveDeal = useMoveDeal();
  const markWon = useMarkDealWon();
  const markLost = useMarkDealLost();
  const updateDeal = useUpdateDeal();
  const completeActivity = useCompleteActivity();
  const deleteActivity = useDeleteActivity();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const pinNote = usePinNote();
  const sendQuote = useSendQuote();
  const duplicateQuote = useDuplicateQuote();
  const voidQuote = useVoidQuote();

  const addDealContact = useMutation({
    mutationFn: (vars: {
      dealId: string;
      contactId: string;
      role?: string;
      isPrimary?: boolean;
    }) =>
      api.post(`/deals/${vars.dealId}/contacts`, {
        contactId: vars.contactId,
        role: vars.role,
        isPrimary: vars.isPrimary,
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: dealKeys.detail(vars.dealId) });
    },
  });

  const removeDealContact = useMutation({
    mutationFn: (vars: { dealId: string; contactId: string }) =>
      api.delete(`/deals/${vars.dealId}/contacts/${vars.contactId}`),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: dealKeys.detail(vars.dealId) });
    },
  });

  const [tab, setTab] = useState<TabId>('overview');
  const [showWonModal, setShowWonModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState<(typeof LOST_REASONS)[number]>('PRICE');
  const [lostDetail, setLostDetail] = useState('');
  const [confetti, setConfetti] = useState(false);
  const [activitySlideOpen, setActivitySlideOpen] = useState(false);
  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');
  const [stageConfirm, setStageConfirm] = useState<{ stageId: string; name: string } | null>(null);

  const contactsSearchQuery = useContacts({
    search: contactSearch,
    limit: 25,
    page: 1,
  });

  useEffect(() => {
    if (!confetti) return;
    const t = window.setTimeout(() => setConfetti(false), 2200);
    return () => window.clearTimeout(t);
  }, [confetti]);

  const invalidateTimeline = useCallback(() => {
    void qc.invalidateQueries({ queryKey: [...dealKeys.timeline(dealId), 'paged'] });
    void qc.invalidateQueries({ queryKey: dealKeys.timeline(dealId) });
  }, [qc, dealId]);

  const onCompleteActivity = useCallback(
    async (activityId: string, outcome: string) => {
      await completeActivity.mutateAsync({ id: activityId, outcome });
      invalidateTimeline();
      void qc.invalidateQueries({ queryKey: activityKeys.forDeal(dealId) });
    },
    [completeActivity, invalidateTimeline, qc, dealId]
  );

  const onDeleteActivity = useCallback(
    async (activityId: string) => {
      if (!window.confirm('Delete this activity?')) return;
      await deleteActivity.mutateAsync(activityId);
      invalidateTimeline();
      void qc.invalidateQueries({ queryKey: activityKeys.forDeal(dealId) });
    },
    [deleteActivity, invalidateTimeline, qc, dealId]
  );

  const canReassign = hasPermission('deals:update');
  const canPinForRole =
    roles.some((r) =>
      ['SALES_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(r)
    ) || hasPermission('notes:update');

  const timelineEvents = useMemo(
    () => timelineInfinite.data?.pages.flatMap((p) => p.data) ?? [],
    [timelineInfinite.data]
  );

  if (!dealId) {
    return <main className="px-6 py-6 text-sm text-red-600">Missing deal id in URL.</main>;
  }

  if (dealQuery.isLoading) {
    return <DealDetailSkeleton />;
  }

  if (dealQuery.isError || !deal) {
    return (
      <main className="px-6 py-10">
        <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-slate-800">Deal not found or you don&apos;t have access.</p>
          <Link href="/deals" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
            ← Back to deals
          </Link>
        </div>
      </main>
    );
  }

  const sortedNotes = useMemo(() => {
    const notes = notesQuery.data?.data ?? [];
    const pinned = notes.filter((n) => n.isPinned);
    const unpinned = notes.filter((n) => !n.isPinned);
    const byDateDesc = (a: Note, b: Note) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return [...pinned.sort(byDateDesc), ...unpinned.sort(byDateDesc)];
  }, [notesQuery.data]);

  const activities = activitiesQuery.data?.data ?? [];
  const quotes = quotesQuery.data?.data ?? [];

  const currentStageOrder = stageList.find((s) => s.id === deal.stageId)?.order ?? 0;

  async function confirmMoveStage() {
    if (!stageConfirm || !deal) return;
    await moveDeal.mutateAsync({ id: deal.id, stageId: stageConfirm.stageId });
    setStageConfirm(null);
  }

  async function onMarkWon() {
    if (!deal) return;
    await markWon.mutateAsync(deal.id);
    setShowWonModal(false);
    setConfetti(true);
  }

  async function onMarkLostSubmit() {
    if (!deal) return;
    await markLost.mutateAsync({
      id: deal.id,
      reason: lostReason,
      detail: lostDetail.trim() || undefined,
    });
    setShowLostModal(false);
    setLostDetail('');
  }

  return (
    <main className="px-4 py-6 sm:px-6">
      <style
        dangerouslySetInnerHTML={{
          __html: `@keyframes deal-confetti-rise{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(-120px) rotate(18deg);opacity:0}}`,
        }}
      />

      {confetti ? (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 gap-1">
          {['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'].map((c, i) => (
            <span
              key={i}
              className="h-3 w-3 rounded-sm"
              style={{
                background: c,
                animation: `deal-confetti-rise 1.8s ease-out ${i * 0.08}s forwards`,
              }}
            />
          ))}
        </div>
      ) : null}

      {showWonModal ? (
        <ConfirmDialog
          title="Mark deal won"
          body={`Congratulations! Mark ${deal.name} as Won?`}
          confirmLabel="Confirm won"
          onCancel={() => setShowWonModal(false)}
          onConfirm={onMarkWon}
          isLoading={markWon.isPending}
        />
      ) : null}

      {showLostModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Mark deal lost</h2>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Lost reason
              <select
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value as (typeof LOST_REASONS)[number])}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {LOST_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Detail (optional)
              <Textarea
                rows={3}
                value={lostDetail}
                onChange={(e) => setLostDetail(e.target.value)}
                className="mt-1 resize-y"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowLostModal(false)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={onMarkLostSubmit} isLoading={markLost.isPending}>
                Confirm lost
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {stageConfirm ? (
        <ConfirmDialog
          title="Move deal"
          body={`Move deal to ${stageConfirm.name}?`}
          confirmLabel="Move"
          onCancel={() => setStageConfirm(null)}
          onConfirm={confirmMoveStage}
          isLoading={moveDeal.isPending}
        />
      ) : null}

      <ActivitySlideOver
        dealId={deal.id}
        ownerId={deal.ownerId}
        open={activitySlideOpen}
        onClose={() => setActivitySlideOpen(false)}
        onCreated={() => {
          invalidateTimeline();
          void qc.invalidateQueries({ queryKey: activityKeys.forDeal(deal.id) });
        }}
      />

      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <header className="rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
            <nav className="mb-3 text-sm text-slate-500">
              <Link href="/deals" className="hover:text-brand-700">
                Deals
              </Link>
              <span className="mx-1">/</span>
              <span className="text-slate-800">{deal.name}</span>
            </nav>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{deal.name}</h1>
                <p className="mt-2 text-3xl font-bold text-slate-900">{formatCurrency(deal.amount, deal.currency)}</p>
                <p className="mt-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-800">{deal.pipeline?.name ?? 'Pipeline'}</span>
                  <span className="mx-1">›</span>
                  <span>{deal.stage?.name ?? 'Stage'}</span>
                </p>
              </div>
              <StatusBadge status={deal.status} />
            </div>
          </header>

          <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
            {(
              [
                ['overview', 'Overview'],
                ['timeline', 'Timeline'],
                ['activities', 'Activities'],
                ['contacts', 'Contacts'],
                ['products', 'Products'],
                ['documents', 'Documents'],
                ['emails', 'Emails'],
                ['approval', 'Approval'],
                ['notes', 'Notes'],
                ['quotes', 'Quotes'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="min-h-[420px] rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
            {tab === 'overview' ? (
              <OverviewTab
                deal={deal}
                contactPopoverOpen={contactPopoverOpen}
                setContactPopoverOpen={setContactPopoverOpen}
                contactSearch={contactSearch}
                setContactSearch={setContactSearch}
                contactsSearchQuery={contactsSearchQuery}
                onAddContact={(vars) => addDealContact.mutateAsync(vars)}
                addContactPending={addDealContact.isPending}
                onRemoveContact={(vars) => removeDealContact.mutateAsync(vars)}
                removeContactPending={removeDealContact.isPending}
              />
            ) : null}

            {tab === 'timeline' ? (
              <TimelineTab
                events={timelineEvents}
                isLoading={timelineInfinite.isLoading}
                isFetchingNext={timelineInfinite.isFetchingNextPage}
                hasNext={Boolean(timelineInfinite.hasNextPage)}
                onLoadMore={() => void timelineInfinite.fetchNextPage()}
                onCompleteActivity={onCompleteActivity}
                completePending={completeActivity.isPending}
              />
            ) : null}

            {tab === 'activities' ? (
              <ActivitiesTab
                activities={activities}
                isLoading={activitiesQuery.isLoading}
                onOpenSchedule={() => setActivitySlideOpen(true)}
                onCompleteActivity={onCompleteActivity}
                onDeleteActivity={onDeleteActivity}
                completePending={completeActivity.isPending}
                deletePending={deleteActivity.isPending}
              />
            ) : null}

            {tab === 'contacts' ? (
              <OverviewTab
                deal={deal}
                contactPopoverOpen={contactPopoverOpen}
                setContactPopoverOpen={setContactPopoverOpen}
                contactSearch={contactSearch}
                setContactSearch={setContactSearch}
                contactsSearchQuery={contactsSearchQuery}
                onAddContact={(vars) => addDealContact.mutateAsync(vars)}
                addContactPending={addDealContact.isPending}
                onRemoveContact={(vars) => removeDealContact.mutateAsync(vars)}
                removeContactPending={removeDealContact.isPending}
              />
            ) : null}

            {tab === 'products' ? <ProductLineItems /> : null}

            {tab === 'documents' ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">Deal documents</h2>
                <DocumentUpload />
              </section>
            ) : null}

            {tab === 'emails' ? (
              <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-900">Email conversations</h2>
                <p className="text-sm text-slate-600">Conversation thread integration with comm-service.</p>
                <Textarea rows={4} placeholder="Reply inline..." />
                <div className="flex justify-end">
                  <Button type="button">Send reply</Button>
                </div>
              </section>
            ) : null}

            {tab === 'approval' ? (
              <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-900">Discount approval status</h2>
                <DiscountApprovalBanner discountPercent={22} thresholdPercent={15} />
              </section>
            ) : null}

            {tab === 'notes' ? (
              <NotesTab
                deal={deal}
                userId={userId}
                sortedNotes={sortedNotes}
                newNoteBody={newNoteBody}
                setNewNoteBody={setNewNoteBody}
                createNote={createNote}
                updateNote={updateNote}
                deleteNote={deleteNote}
                pinNote={pinNote}
                canPinForRole={canPinForRole}
                notesLoading={notesQuery.isLoading}
                onNoteCreated={invalidateTimeline}
              />
            ) : null}

            {tab === 'quotes' ? (
              <QuotesTab
                deal={deal}
                quotes={quotes}
                isLoading={quotesQuery.isLoading}
                sendQuote={sendQuote}
                duplicateQuote={duplicateQuote}
                voidQuote={voidQuote}
              />
            ) : null}
          </div>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit lg:col-span-1">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Deal info</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-slate-500">Owner</dt>
                <dd className="flex items-center gap-2">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{
                      background: hashHue(
                        `${deal.owner?.firstName ?? ''}${deal.owner?.lastName ?? ''}` || deal.ownerId
                      ),
                    }}
                  >
                    {initials(deal.owner?.firstName ?? '', deal.owner?.lastName ?? '')}
                  </span>
                  <span className="font-medium text-slate-900">
                    {deal.owner?.firstName || deal.owner?.lastName
                      ? `${deal.owner?.firstName ?? ''} ${deal.owner?.lastName ?? ''}`.trim()
                      : deal.ownerId.slice(0, 8)}
                  </span>
                </dd>
              </div>
              {canReassign ? (
                <div className="text-right">
                  <Link href={`/deals/${deal.id}/edit`} className="text-xs font-medium text-brand-700 hover:underline">
                    Reassign
                  </Link>
                </div>
              ) : null}
              <div>
                <dt className="text-slate-500">Expected close</dt>
                <dd
                  className={
                    deal.expectedCloseDate &&
                    deal.status === 'OPEN' &&
                    new Date(deal.expectedCloseDate).getTime() < Date.now()
                      ? 'font-semibold text-red-600'
                      : 'text-slate-900'
                  }
                >
                  {formatDate(deal.expectedCloseDate)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Probability</dt>
                <dd className="mt-1">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${
                        (deal.probability ?? 0) >= 70
                          ? 'bg-emerald-500'
                          : (deal.probability ?? 0) >= 40
                            ? 'bg-amber-500'
                            : 'bg-slate-400'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, deal.probability ?? 0))}%` }}
                    />
                  </div>
                  <span className="mt-1 block text-xs text-slate-600">{deal.probability ?? 0}%</span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Forecast</dt>
                <dd className="mt-1">
                  <select
                    value={deal.forecastCategory}
                    onChange={(e) => {
                      const v = e.target.value as (typeof FORECAST_OPTIONS)[number];
                      void updateDeal.mutateAsync({ id: deal.id, data: { forecastCategory: v } });
                    }}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    {FORECAST_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Created</dt>
                <dd>{formatDate(deal.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Updated</dt>
                <dd>{relativeTime(deal.updatedAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Stage progression</h2>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {stageList.length > 0 ? (
                stageList.map((s) => {
                  const past = s.order < currentStageOrder;
                  const current = s.id === deal.stageId;
                  const future = s.order > currentStageOrder;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={deal.status !== 'OPEN' || current}
                      onClick={() => {
                        if (future) setStageConfirm({ stageId: s.id, name: s.name });
                      }}
                      className={`flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-left text-xs font-medium transition ${
                        current
                          ? 'border-blue-600 bg-blue-50 text-blue-900'
                          : past
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      } ${deal.status !== 'OPEN' || current ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
                          current ? 'border-blue-600 bg-blue-600' : past ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white'
                        }`}
                      />
                      <span className={current ? 'font-bold' : ''}>{s.name}</span>
                    </button>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500">No stages available.</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Quick actions</h2>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                disabled={deal.status !== 'OPEN'}
                onClick={() => setShowWonModal(true)}
                className="w-full rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                🎉 Mark Won
              </button>
              <button
                type="button"
                disabled={deal.status !== 'OPEN'}
                onClick={() => setShowLostModal(true)}
                className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Mark Lost
              </button>
              <Link
                href={`/deals/${deal.id}/edit`}
                className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Edit Deal
              </Link>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Tags</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {(deal.tags ?? []).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="group inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                  onClick={() => {
                    const next = (deal.tags ?? []).filter((t) => t !== tag);
                    void updateDeal.mutateAsync({ id: deal.id, data: { tags: next } });
                  }}
                  title="Click to remove"
                >
                  {tag}
                  <span className="text-slate-400 group-hover:text-slate-700">×</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="New tag — press Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || !tagInput.trim()) return;
                  e.preventDefault();
                  const next = [...(deal.tags ?? []), tagInput.trim()];
                  setTagInput('');
                  void updateDeal.mutateAsync({ id: deal.id, data: { tags: next } });
                }}
                className="text-sm"
              />
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function OverviewTab({
  deal,
  contactPopoverOpen,
  setContactPopoverOpen,
  contactSearch,
  setContactSearch,
  contactsSearchQuery,
  onAddContact,
  addContactPending,
  onRemoveContact,
  removeContactPending,
}: {
  deal: DealWithRelations;
  contactPopoverOpen: boolean;
  setContactPopoverOpen: (v: boolean) => void;
  contactSearch: string;
  setContactSearch: (v: string) => void;
  contactsSearchQuery: ReturnType<typeof useContacts>;
  onAddContact: (vars: {
    dealId: string;
    contactId: string;
    role?: string;
    isPrimary?: boolean;
  }) => Promise<unknown>;
  addContactPending: boolean;
  onRemoveContact: (vars: { dealId: string; contactId: string }) => Promise<unknown>;
  removeContactPending: boolean;
}) {
  const [addRole, setAddRole] = useState('');
  const [addPrimary, setAddPrimary] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [showCustomFields, setShowCustomFields] = useState(false);
  const score = deal.meddicicScore ?? 0;
  const customFields = deal.customFields;

  return (
    <div className="space-y-8">
      {deal.account ? (
        <section className="rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-900">Account</h2>
          <div className="mt-3 flex flex-wrap gap-4">
            <div>
              <Link href="/accounts" className="text-lg font-semibold text-brand-700 hover:underline">
                {deal.account.name}
              </Link>
              {normalizeWebsite(deal.account.website) ? (
                <a
                  href={normalizeWebsite(deal.account.website) ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-sm text-brand-600 hover:underline"
                >
                  <span aria-hidden>↗</span>
                  {deal.account.website}
                </a>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {deal.account.industry ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {deal.account.industry}
                  </span>
                ) : null}
                <span className="text-sm text-slate-600">
                  ARR: {formatCurrency(Number(deal.account.annualRevenue ?? 0), deal.currency)}
                </span>
                {deal.account.tier ? <TierBadge tier={deal.account.tier} /> : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-900">MEDDIC</h2>
        <div className="mt-4 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <MeddicRing score={score} />
          <div className="min-w-0 flex-1">
            <DealMeddicicForm
              dealId={deal.id}
              initialData={(deal.meddicicData ?? {}) as Record<string, unknown>}
              contacts={(deal.contacts ?? [])
                .map((c) => c.contact)
                .filter((c): c is NonNullable<typeof c> => Boolean(c))
                .map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName }))}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Contacts</h2>
          <div className="relative">
            <Button type="button" variant="secondary" onClick={() => setContactPopoverOpen(!contactPopoverOpen)}>
              + Add Contact
            </Button>
            {contactPopoverOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                <Input
                  placeholder="Search contacts…"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  className="text-sm"
                />
                <div className="mt-2 max-h-40 overflow-y-auto rounded border border-slate-100">
                  {(contactsSearchQuery.data?.data ?? []).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-slate-50 ${
                        selectedContactId === c.id ? 'bg-brand-50' : ''
                      }`}
                      onClick={() => setSelectedContactId(c.id)}
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ background: hashHue(`${c.firstName}${c.lastName}`) }}
                      >
                        {initials(c.firstName, c.lastName)}
                      </span>
                      <span className="truncate">
                        {c.firstName} {c.lastName}
                      </span>
                    </button>
                  ))}
                </div>
                <label className="mt-2 block text-xs font-medium text-slate-600">Role</label>
                <Input value={addRole} onChange={(e) => setAddRole(e.target.value)} placeholder="e.g. Champion" className="mt-1 text-sm" />
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={addPrimary} onChange={(e) => setAddPrimary(e.target.checked)} />
                  Primary contact
                </label>
                <div className="mt-3 flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setContactPopoverOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={!selectedContactId}
                    isLoading={addContactPending}
                    onClick={async () => {
                      if (!selectedContactId) return;
                      await onAddContact({
                        dealId: deal.id,
                        contactId: selectedContactId,
                        role: addRole.trim() || undefined,
                        isPrimary: addPrimary,
                      });
                      setContactPopoverOpen(false);
                      setSelectedContactId(null);
                      setAddRole('');
                      setAddPrimary(false);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <ul className="mt-4 divide-y divide-slate-100">
          {(deal.contacts ?? []).map((c, i) => {
            const contact = c.contact;
            const name = contact ? `${contact.firstName} ${contact.lastName}` : 'Unknown';
            return (
              <li key={c.contact?.id ?? c.contactId ?? i} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: hashHue(name) }}
                  >
                    {contact ? initials(contact.firstName, contact.lastName) : '?'}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{name}</p>
                    <p className="truncate text-xs text-slate-500">{contact?.email ?? '—'}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {c.role ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{c.role}</span>
                  ) : null}
                  {contact ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-xs text-red-600"
                      onClick={() => void onRemoveContact({ dealId: deal.id, contactId: contact.id })}
                      isLoading={removeContactPending}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
          {(!deal.contacts || deal.contacts.length === 0) && (
            <li className="py-6 text-center text-sm text-slate-500">No contacts linked.</li>
          )}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 p-4">
        <button
          type="button"
          onClick={() => setShowCustomFields((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-semibold text-slate-900"
        >
          Custom fields
          <span className="text-slate-400">{showCustomFields ? '−' : '+'}</span>
        </button>
        {showCustomFields && customFields && typeof customFields === 'object' && !Array.isArray(customFields) ? (
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(customFields as Record<string, unknown>).map(([k, v]) => (
              <div key={k} className="rounded-md bg-slate-50 px-3 py-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
                <dd className="mt-0.5 text-sm text-slate-900">{String(v)}</dd>
              </div>
            ))}
          </dl>
        ) : showCustomFields ? (
          <p className="mt-2 text-sm text-slate-500">No custom fields.</p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Tags</h2>
        <div className="flex flex-wrap gap-2">
          {(deal.tags ?? []).map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              {tag}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const t = tier.toUpperCase();
  const cls =
    t === 'STRATEGIC'
      ? 'bg-purple-100 text-purple-800'
      : t === 'ENTERPRISE'
        ? 'bg-blue-100 text-blue-800'
        : t === 'MID_MARKET'
          ? 'bg-teal-100 text-teal-800'
          : 'bg-slate-100 text-slate-700';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{tier}</span>;
}

function MeddicRing({ score }: { score: number }) {
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;
  const stroke = clamped < 40 ? '#dc2626' : clamped <= 70 ? '#d97706' : '#16a34a';
  return (
    <div className="relative flex flex-col items-center">
      <svg width={100} height={100} viewBox="0 0 100 100" role="img" aria-label={`MEDDIC score ${clamped} out of 100`}>
        <circle cx="50" cy="50" r={r} stroke="#e2e8f0" strokeWidth="8" fill="none" />
        <circle
          cx="50"
          cy="50"
          r={r}
          stroke={stroke}
          strokeWidth="8"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="54" textAnchor="middle" className="fill-slate-900 text-xl font-bold">
          {clamped}
        </text>
      </svg>
      <span className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">MEDDIC</span>
    </div>
  );
}

function TimelineTab({
  events,
  isLoading,
  isFetchingNext,
  hasNext,
  onLoadMore,
  onCompleteActivity,
  completePending,
}: {
  events: TimelineEvent[];
  isLoading: boolean;
  isFetchingNext: boolean;
  hasNext: boolean;
  onLoadMore: () => void;
  onCompleteActivity: (id: string, outcome: string) => Promise<void>;
  completePending: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [completeFor, setCompleteFor] = useState<string | null>(null);
  const [outcome, setOutcome] = useState('');

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading timeline…</p>;
  }

  return (
    <div className="relative pl-6">
      <div className="absolute bottom-0 left-[11px] top-2 w-px bg-slate-200" aria-hidden />
      <ul className="space-y-6">
        {events.map((ev) => {
          const meta = ev.metadata ?? {};
          const isNote = ev.type === 'NOTE';
          const isActivity = ev.type === 'ACTIVITY';
          const status = typeof meta.status === 'string' ? meta.status : '';
          const activityId = typeof meta.activityId === 'string' ? meta.activityId : '';
          const showComplete = isActivity && activityIsOpen(status);

          return (
            <li key={ev.id} className="relative">
              <span className="absolute -left-6 top-1.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-slate-300 ring-2 ring-slate-100" />
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                <div className="flex items-start gap-3">
                  <span className="text-lg" aria-hidden>
                    {isNote ? '📝' : isActivity ? activityIcon(typeof meta.activityType === 'string' ? meta.activityType : '') : '🔔'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{ev.title}</p>
                    {isActivity ? (
                      <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        {status || '—'}
                      </span>
                    ) : null}
                    {isNote ? (
                      <div className="mt-2">
                        <p
                          className={`whitespace-pre-wrap text-sm text-slate-700 ${
                            expanded[ev.id] ? '' : 'line-clamp-3'
                          }`}
                        >
                          {ev.description ?? ''}
                        </p>
                        {(ev.description?.length ?? 0) > 140 ? (
                          <button
                            type="button"
                            className="mt-1 text-xs font-medium text-brand-700 hover:underline"
                            onClick={() => setExpanded((m) => ({ ...m, [ev.id]: !m[ev.id] }))}
                          >
                            {expanded[ev.id] ? 'Show less' : 'Expand'}
                          </button>
                        ) : null}
                        {meta.isPinned === true ? <span className="ml-2" title="Pinned">📌</span> : null}
                      </div>
                    ) : (
                      ev.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{ev.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{relativeTime(ev.at)}</span>
                      {ev.actorId ? (
                        <span className="rounded-full bg-slate-200 px-1.5 py-0.5 font-mono text-[10px]">
                          {ev.actorId.slice(0, 2).toUpperCase()}
                        </span>
                      ) : null}
                    </div>
                    {showComplete ? (
                      <div className="mt-2">
                        {completeFor === activityId ? (
                          <div className="rounded-md border border-slate-200 bg-white p-2">
                            <Textarea
                              rows={2}
                              placeholder="Outcome"
                              value={outcome}
                              onChange={(e) => setOutcome(e.target.value)}
                              className="text-sm"
                            />
                            <div className="mt-2 flex justify-end gap-2">
                              <Button type="button" variant="ghost" onClick={() => setCompleteFor(null)}>
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                disabled={!outcome.trim()}
                                isLoading={completePending}
                                onClick={async () => {
                                  await onCompleteActivity(activityId, outcome.trim());
                                  setCompleteFor(null);
                                  setOutcome('');
                                }}
                              >
                                Complete
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button type="button" variant="secondary" className="text-xs" onClick={() => setCompleteFor(activityId)}>
                            Complete
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {events.length === 0 ? <p className="text-sm text-slate-500">No timeline events yet.</p> : null}
      {hasNext ? (
        <div className="mt-6 pl-0">
          <Button type="button" variant="secondary" onClick={onLoadMore} isLoading={isFetchingNext}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function activityIcon(type: string): string {
  if (type === 'CALL') return '📞';
  if (type === 'EMAIL') return '✉️';
  if (type === 'MEETING') return '📅';
  return '📌';
}

function ActivitiesTab({
  activities,
  isLoading,
  onOpenSchedule,
  onCompleteActivity,
  onDeleteActivity,
  completePending,
  deletePending,
}: {
  activities: import('@nexus/shared-types').Activity[];
  isLoading: boolean;
  onOpenSchedule: () => void;
  onCompleteActivity: (id: string, outcome: string) => Promise<void>;
  onDeleteActivity: (id: string) => Promise<void>;
  completePending: boolean;
  deletePending: boolean;
}) {
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState('');

  if (isLoading) return <p className="text-sm text-slate-500">Loading activities…</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={onOpenSchedule}>
          + Schedule Activity
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => {
              const due = a.dueDate ? new Date(a.dueDate) : null;
              const overdue =
                Boolean(due && due.getTime() < Date.now() && activityIsOpen(a.status));
              return (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <span className="text-base" title={a.type}>
                      {activityIcon(a.type)}
                    </span>{' '}
                    <span className="text-slate-600">{a.type}</span>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{a.subject}</td>
                  <td className={`px-3 py-2 ${overdue ? 'font-semibold text-red-600' : ''}`}>
                    {a.dueDate ? formatDateTime(a.dueDate) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <PriorityBadge priority={a.priority} />
                  </td>
                  <td className="px-3 py-2">
                    <ActivityStatusChip status={a.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{a.ownerId.slice(0, 8)}…</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-1">
                      {activityIsOpen(a.status) ? (
                        completeId === a.id ? (
                          <div className="flex w-48 flex-col gap-1 rounded border border-slate-200 bg-white p-2 text-left">
                            <Textarea rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} className="text-xs" />
                            <div className="flex justify-end gap-1">
                              <Button type="button" variant="ghost" className="text-xs" onClick={() => setCompleteId(null)}>
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                className="text-xs"
                                disabled={!outcome.trim()}
                                isLoading={completePending}
                                onClick={async () => {
                                  await onCompleteActivity(a.id, outcome.trim());
                                  setCompleteId(null);
                                  setOutcome('');
                                }}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button type="button" variant="secondary" className="text-xs" onClick={() => setCompleteId(a.id)}>
                            Complete
                          </Button>
                        )
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-xs text-red-600"
                        isLoading={deletePending}
                        onClick={() => onDeleteActivity(a.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {activities.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-slate-500">No activities for this deal.</p>
        ) : null}
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    URGENT: 'bg-red-100 text-red-800',
    HIGH: 'bg-orange-100 text-orange-800',
    MEDIUM: 'bg-blue-100 text-blue-800',
    NORMAL: 'bg-blue-100 text-blue-800',
    LOW: 'bg-slate-100 text-slate-700',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[priority] ?? map.NORMAL}`}>{priority}</span>;
}

function ActivityStatusChip({ status }: { status: string }) {
  if (status === 'COMPLETED') {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">DONE</span>;
  }
  if (status === 'CANCELLED') {
    return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">CANCELLED</span>;
  }
  return <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">OPEN</span>;
}

function ActivitySlideOver({
  dealId,
  ownerId,
  open,
  onClose,
  onCreated,
}: {
  dealId: string;
  ownerId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const createActivity = useCreateActivity();
  const [type, setType] = useState<CreateActivityInput['type']>('TASK');
  const [subject, setSubject] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<CreateActivityInput['priority']>('NORMAL');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!open) {
      setSubject('');
      setDueDate('');
      setDescription('');
      setType('TASK');
      setPriority('NORMAL');
    }
  }, [open]);

  if (!open) return null;

  async function submit() {
    if (!subject.trim()) return;
    const dueIso =
      dueDate.trim() === ''
        ? undefined
        : (() => {
            const d = new Date(dueDate);
            return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
          })();
    await createActivity.mutateAsync({
      dealId,
      type,
      subject: subject.trim(),
      dueDate: dueIso,
      priority,
      description: description.trim() || undefined,
      ownerId,
      customFields: {},
    });
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40">
      <div className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Schedule activity</h2>
          <button type="button" className="rounded p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <label className="block text-sm font-medium text-slate-700">
            Type
            <select
              value={type}
              onChange={(e) => setType(e.target.value as CreateActivityInput['type'])}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {(['CALL', 'EMAIL', 'MEETING', 'TASK', 'DEMO', 'FOLLOW_UP'] as const).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Subject *
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" required />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Due date
            <Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as CreateActivityInput['priority'])}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {(
                [
                  ['LOW', 'Low'],
                  ['NORMAL', 'Medium'],
                  ['HIGH', 'High'],
                  ['URGENT', 'Urgent'],
                ] as const
              ).map(([p, label]) => (
                <option key={p} value={p}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Description
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" />
          </label>
        </div>
        <div className="border-t border-slate-200 p-4">
          <Button type="button" className="w-full" onClick={submit} isLoading={createActivity.isPending} disabled={!subject.trim()}>
            Save activity
          </Button>
        </div>
      </div>
    </div>
  );
}

function NotesTab({
  deal,
  userId,
  sortedNotes,
  newNoteBody,
  setNewNoteBody,
  createNote,
  updateNote,
  deleteNote,
  pinNote,
  canPinForRole,
  notesLoading,
  onNoteCreated,
}: {
  deal: DealWithRelations;
  userId: string | null;
  sortedNotes: Note[];
  newNoteBody: string;
  setNewNoteBody: (v: string) => void;
  createNote: ReturnType<typeof useCreateNote>;
  updateNote: ReturnType<typeof useUpdateNote>;
  deleteNote: ReturnType<typeof useDeleteNote>;
  pinNote: ReturnType<typeof usePinNote>;
  canPinForRole: boolean;
  notesLoading: boolean;
  onNoteCreated: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  if (notesLoading) return <p className="text-sm text-slate-500">Loading notes…</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <Textarea
          placeholder="Write a note..."
          rows={3}
          value={newNoteBody}
          onChange={(e) => setNewNoteBody(e.target.value)}
          className="bg-white"
        />
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            onClick={async () => {
              if (!newNoteBody.trim()) return;
              await createNote.mutateAsync({
                content: newNoteBody.trim(),
                dealId: deal.id,
                isPinned: false,
              });
              setNewNoteBody('');
              onNoteCreated();
            }}
            isLoading={createNote.isPending}
          >
            Save Note
          </Button>
        </div>
      </div>

      <ul className="space-y-4">
        {sortedNotes.map((n) => {
          const isAuthor = Boolean(userId && n.authorId === userId);
          const editing = editingId === n.id;
          return (
            <li key={n.id} className="group rounded-lg border border-slate-200 p-4 transition hover:border-slate-300">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: hashHue(n.authorId ?? 'author') }}
                  >
                    {(n.authorId ?? '?').slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{relativeTime(n.createdAt)}</span>
                      {n.isPinned ? <span title="Pinned">📌</span> : null}
                    </div>
                    {editing ? (
                      <Textarea rows={4} value={editContent} onChange={(e) => setEditContent(e.target.value)} className="mt-2" />
                    ) : (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{n.content}</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                  {isAuthor && !editing ? (
                    <button
                      type="button"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                      title="Edit"
                      onClick={() => {
                        setEditingId(n.id);
                        setEditContent(n.content);
                      }}
                    >
                      ✎
                    </button>
                  ) : null}
                  {isAuthor && editing ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="text-xs"
                      onClick={async () => {
                        await updateNote.mutateAsync({ id: n.id, data: { content: editContent } });
                        setEditingId(null);
                      }}
                    >
                      Save
                    </Button>
                  ) : null}
                  {canPinForRole ? (
                    <button
                      type="button"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                      title={n.isPinned ? 'Unpin' : 'Pin'}
                      onClick={() => pinNote.mutate({ id: n.id, pinned: !n.isPinned })}
                    >
                      📍
                    </button>
                  ) : null}
                  {isAuthor ? (
                    <button
                      type="button"
                      className="rounded p-1.5 text-red-500 hover:bg-red-50"
                      title="Delete"
                      onClick={() => {
                        if (window.confirm('Delete this note?')) deleteNote.mutate(n.id);
                      }}
                    >
                      🗑
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function QuotesTab({
  deal,
  quotes,
  isLoading,
  sendQuote,
  duplicateQuote,
  voidQuote,
}: {
  deal: DealWithRelations;
  quotes: import('@/hooks/use-quotes').Quote[];
  isLoading: boolean;
  sendQuote: ReturnType<typeof useSendQuote>;
  duplicateQuote: ReturnType<typeof useDuplicateQuote>;
  voidQuote: ReturnType<typeof useVoidQuote>;
}) {
  const qc = useQueryClient();

  if (isLoading) return <p className="text-sm text-slate-500">Loading quotes…</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href={`/quotes/new?dealId=${deal.id}`}>
          <Button type="button">+ New Quote</Button>
        </Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2">Quote #</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Version</th>
              <th className="px-3 py-2">Expires</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => {
              const pseudoNumber = `Q-${deal.id.slice(-4).toUpperCase()}-${q.version}`;
              return (
                <tr key={q.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs font-medium">{pseudoNumber}</td>
                  <td className="px-3 py-2">
                    <QuoteStatusBadge status={q.status} />
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(Number(q.total), q.currency)}</td>
                  <td className="px-3 py-2">{q.version}</td>
                  <td className="px-3 py-2">{q.expiresAt ? formatDate(q.expiresAt) : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-1">
                      {q.status === 'DRAFT' ? (
                        <Button type="button" variant="secondary" className="text-xs" onClick={() => sendQuote.mutate(q.id)}>
                          Send
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-xs"
                        onClick={() =>
                          duplicateQuote.mutate(q.id, {
                            onSuccess: () => {
                              void qc.invalidateQueries({ queryKey: quoteKeys.forDeal(deal.id) });
                            },
                          })
                        }
                        isLoading={duplicateQuote.isPending}
                      >
                        Duplicate
                      </Button>
                      {q.status === 'DRAFT' || q.status === 'SENT' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-xs text-slate-600"
                          onClick={() => {
                            if (window.confirm('Void this quote?')) {
                              voidQuote.mutate({ id: q.id, reason: 'User cancelled' });
                            }
                          }}
                          isLoading={voidQuote.isPending}
                        >
                          Void
                        </Button>
                      ) : null}
                      <span title="PDF export coming soon">
                        <Button type="button" variant="ghost" className="text-xs" disabled>
                          Download
                        </Button>
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {quotes.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-slate-500">No quotes yet.</p>
        ) : null}
      </div>
    </div>
  );
}

function QuoteStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: 'bg-slate-100 text-slate-700',
    SENT: 'bg-blue-100 text-blue-800',
    ACCEPTED: 'bg-emerald-100 text-emerald-800',
    REJECTED: 'bg-red-100 text-red-800',
    EXPIRED: 'bg-amber-100 text-amber-800',
    VOID: 'bg-slate-300 text-slate-800',
    PENDING_APPROVAL: 'bg-yellow-100 text-yellow-900',
    APPROVED: 'bg-teal-100 text-teal-800',
    VIEWED: 'bg-indigo-100 text-indigo-800',
    CONVERTED: 'bg-purple-100 text-purple-800',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colors[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {status}
    </span>
  );
}

function StatusBadge({ status }: { status: Deal['status'] }) {
  const cls =
    status === 'WON'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'LOST'
        ? 'bg-red-100 text-red-800'
        : status === 'DORMANT'
          ? 'bg-slate-200 text-slate-700'
          : 'bg-blue-100 text-blue-800';
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{status}</span>;
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
  isLoading,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  isLoading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void onConfirm()} isLoading={isLoading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DealDetailSkeleton(): JSX.Element {
  return (
    <main className="px-4 py-6 sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="h-40 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-10 animate-pulse rounded-md bg-slate-200" />
          <div className="h-[480px] animate-pulse rounded-lg bg-slate-200" />
        </div>
        <div className="space-y-4">
          <div className="h-56 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-40 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-36 animate-pulse rounded-lg bg-slate-200" />
        </div>
      </div>
    </main>
  );
}
