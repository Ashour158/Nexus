'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Deal, Note, TimelineEvent } from '@nexus/shared-types';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { DealMeddicicForm } from '@/components/deals/deal-meddic-form';
import {
  useDeal,
  useMarkDealLost,
  useMarkDealWon,
  useMoveDeal,
  useDealTimeline,
} from '@/hooks/use-deals';
import {
  useDealActivities,
  useCreateActivity,
  useCompleteActivity,
} from '@/hooks/use-activities';
import {
  useCreateNote,
  useDealNotes,
  useDeleteNote,
  usePinNote,
  useUpdateNote,
} from '@/hooks/use-notes';
import {
  useAcceptQuote,
  useDealQuotes,
  useRejectQuote,
  useSendQuote,
} from '@/hooks/use-quotes';
import { useAuthStore } from '@/stores/auth.store';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';

type DealWithRelations = Deal & {
  account?: {
    id: string;
    name: string;
    website?: string | null;
    industry?: string | null;
    annualRevenue?: string | null;
    tier?: string | null;
  };
  stage?: { id: string; name: string; order?: number; probability?: number };
  pipeline?: { id: string; name: string };
  owner?: { id: string; firstName?: string; lastName?: string };
  contacts?: Array<{
    id?: string;
    role?: string | null;
    contactId?: string;
    contact?: { id: string; firstName: string; lastName: string; email?: string | null };
  }>;
  stages?: Array<{ id: string; name: string; order: number }>;
};

export default function DealDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const dealId = params?.id ?? '';
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);

  const dealQuery = useDeal(dealId);
  const timelineQuery = useDealTimeline(dealId);
  const activitiesQuery = useDealActivities(dealId, { limit: 100 });
  const notesQuery = useDealNotes(dealId, { limit: 100 });
  const quotesQuery = useDealQuotes(dealId);

  const moveDeal = useMoveDeal();
  const markWon = useMarkDealWon();
  const markLost = useMarkDealLost();
  const createActivity = useCreateActivity();
  const completeActivity = useCompleteActivity();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const pinNote = usePinNote();
  const sendQuote = useSendQuote();
  const acceptQuote = useAcceptQuote();
  const rejectQuote = useRejectQuote();

  const [tab, setTab] = useState<'overview' | 'timeline' | 'activities' | 'notes' | 'quotes'>(
    'overview'
  );
  const [timelinePage, setTimelinePage] = useState(1);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activitySubject, setActivitySubject] = useState('');
  const [activityDueDate, setActivityDueDate] = useState('');
  const [activityType, setActivityType] = useState<'CALL' | 'EMAIL' | 'MEETING' | 'TASK'>('TASK');
  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState('');
  const [showCustomFields, setShowCustomFields] = useState(false);

  const deal = dealQuery.data as DealWithRelations | undefined;
  const timeline = timelineQuery.data?.data ?? [];
  const activities = activitiesQuery.data?.data ?? [];
  const notes = notesQuery.data?.data ?? [];
  const quotes = quotesQuery.data?.data ?? [];

  const timelinePageSize = 15;
  const timelinePaged = timeline.slice(0, timelinePage * timelinePageSize);
  const canLoadMoreTimeline = timelinePaged.length < timeline.length;

  const sortedNotes = useMemo(() => {
    const pinned = notes.filter((n) => n.isPinned);
    const unpinned = notes.filter((n) => !n.isPinned);
    const byDateDesc = (a: Note, b: Note) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return [...pinned.sort(byDateDesc), ...unpinned.sort(byDateDesc)];
  }, [notes]);

  const stageList = useMemo(() => {
    const fromDeal = Array.isArray(deal?.stages) ? deal.stages : [];
    return [...fromDeal].sort((a, b) => a.order - b.order);
  }, [deal]);

  async function scheduleActivity() {
    if (!deal || !activitySubject.trim()) return;
    await createActivity.mutateAsync({
      type: activityType,
      subject: activitySubject.trim(),
      priority: 'NORMAL',
      ownerId: deal.ownerId,
      dealId: deal.id,
      dueDate: activityDueDate ? new Date(activityDueDate).toISOString() : undefined,
      customFields: {},
    });
    setActivitySubject('');
    setActivityDueDate('');
    setShowActivityForm(false);
  }

  async function completeOpenActivity(activityId: string) {
    const outcome = window.prompt('Enter outcome');
    if (!outcome) return;
    await completeActivity.mutateAsync({ id: activityId, outcome });
  }

  async function addNote() {
    if (!newNote.trim() || !deal) return;
    await createNote.mutateAsync({ content: newNote.trim(), dealId: deal.id, isPinned: false });
    setNewNote('');
  }

  async function onMoveStage(stageId: string) {
    if (!deal || stageId === deal.stageId) return;
    await moveDeal.mutateAsync({ id: deal.id, stageId });
  }

  async function onMarkLost() {
    if (!deal) return;
    const reason = window.prompt('Loss reason');
    if (!reason) return;
    const detail = window.prompt('Additional detail (optional)') ?? undefined;
    await markLost.mutateAsync({ id: deal.id, reason, detail });
  }

  if (!dealId) {
    return <main className="px-6 py-6 text-sm text-red-600">Missing deal id in URL.</main>;
  }

  if (dealQuery.isLoading) {
    return (
      <main className="space-y-4 px-6 py-6">
        <Skeleton className="h-24 rounded-md" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-[600px] rounded-md lg:col-span-2" />
          <Skeleton className="h-[600px] rounded-md" />
        </div>
      </main>
    );
  }

  if (!deal) {
    return (
      <main className="px-6 py-6">
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-red-700">
          Deal not found or inaccessible.
        </p>
      </main>
    );
  }

  const isOverdueClose =
    deal.expectedCloseDate && new Date(deal.expectedCloseDate).getTime() < Date.now();

  return (
    <main className="px-6 py-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <header className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{deal.name}</h1>
                <p className="mt-1 text-3xl font-extrabold text-slate-900">
                  {formatCurrency(deal.amount, deal.currency)}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {deal.pipeline?.name ?? 'Pipeline'} / {deal.stage?.name ?? 'Stage'}
                </p>
              </div>
              <StatusBadge status={deal.status} />
            </div>
          </header>

          <nav className="flex flex-wrap gap-2">
            {(
              [
                ['overview', 'Overview'],
                ['timeline', 'Timeline'],
                ['activities', 'Activities'],
                ['notes', 'Notes'],
                ['quotes', 'Quotes'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  tab === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            {tab === 'overview' ? (
              <div className="space-y-5">
                <section className="rounded-md border border-slate-200 p-3">
                  <h2 className="text-sm font-semibold text-slate-900">Account</h2>
                  {deal.account ? (
                    <div className="mt-2 space-y-1 text-sm">
                      <Link href={`/accounts`} className="font-semibold text-brand-700 hover:underline">
                        {deal.account.name}
                      </Link>
                      <p className="text-slate-600">{deal.account.website || 'No website'}</p>
                      <p className="text-slate-600">{deal.account.industry || 'Industry —'}</p>
                      <p className="text-slate-700">
                        ARR: {formatCurrency(deal.account.annualRevenue ?? 0, deal.currency)}
                      </p>
                      {deal.account.tier ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {deal.account.tier}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No linked account.</p>
                  )}
                </section>

                <section className="rounded-md border border-slate-200 p-3">
                  <h2 className="text-sm font-semibold text-slate-900">MEDDIC</h2>
                  <div className="mt-3 flex items-center gap-4">
                    <CircularScore value={deal.meddicicScore ?? 0} />
                    <p className="text-sm text-slate-600">Qualification confidence</p>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium text-slate-700">
                      Edit MEDDIC details
                    </summary>
                    <div className="mt-3">
                      <DealMeddicicForm
                        dealId={deal.id}
                        initialData={(deal.meddicicData ?? {}) as Record<string, unknown>}
                        contacts={(deal.contacts ?? [])
                          .map((c) => c.contact)
                          .filter(Boolean)
                          .map((c) => ({
                            id: c!.id,
                            firstName: c!.firstName,
                            lastName: c!.lastName,
                          }))}
                      />
                    </div>
                  </details>
                </section>

                <section className="rounded-md border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">Contacts</h2>
                    <Button type="button" variant="secondary" onClick={() => router.push(`/deals/${deal.id}/edit`)}>
                      + Add Contact
                    </Button>
                  </div>
                  <ul className="space-y-2">
                    {(deal.contacts ?? []).map((c, i) => (
                      <li key={c.contact?.id ?? c.contactId ?? i} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                        <div className="text-sm">
                          <div className="font-medium text-slate-900">
                            {c.contact ? `${c.contact.firstName} ${c.contact.lastName}` : 'Unknown contact'}
                          </div>
                          <div className="text-xs text-slate-500">{c.contact?.email ?? '—'}</div>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {c.role ?? 'Stakeholder'}
                        </span>
                      </li>
                    ))}
                    {(!deal.contacts || deal.contacts.length === 0) && (
                      <li className="text-sm text-slate-500">No linked contacts yet.</li>
                    )}
                  </ul>
                </section>

                <section className="rounded-md border border-slate-200 p-3">
                  <button
                    type="button"
                    onClick={() => setShowCustomFields((v) => !v)}
                    className="text-sm font-semibold text-slate-900"
                  >
                    {showCustomFields ? 'Hide' : 'Show'} custom fields
                  </button>
                  {showCustomFields ? (
                    <pre className="mt-2 overflow-auto rounded bg-slate-950 p-3 text-xs text-emerald-100">
                      {JSON.stringify(deal.customFields ?? {}, null, 2)}
                    </pre>
                  ) : null}
                </section>
              </div>
            ) : null}

            {tab === 'timeline' ? (
              <section className="space-y-3">
                {timelinePaged.map((entry) => (
                  <TimelineRow key={entry.id} event={entry} />
                ))}
                {timelinePaged.length === 0 ? (
                  <p className="text-sm text-slate-500">No timeline events yet.</p>
                ) : null}
                {canLoadMoreTimeline ? (
                  <Button type="button" variant="secondary" onClick={() => setTimelinePage((p) => p + 1)}>
                    Load more
                  </Button>
                ) : null}
              </section>
            ) : null}

            {tab === 'activities' ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Activities</h2>
                  <Button type="button" onClick={() => setShowActivityForm((v) => !v)}>
                    + Schedule Activity
                  </Button>
                </div>

                {showActivityForm ? (
                  <div className="rounded-md border border-slate-200 p-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <FormField label="Type">
                        {({ id }) => (
                          <select
                            id={id}
                            value={activityType}
                            onChange={(e) => setActivityType(e.target.value as typeof activityType)}
                            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
                          >
                            <option value="TASK">Task</option>
                            <option value="CALL">Call</option>
                            <option value="EMAIL">Email</option>
                            <option value="MEETING">Meeting</option>
                          </select>
                        )}
                      </FormField>
                      <FormField label="Due date">
                        {({ id }) => (
                          <Input id={id} type="datetime-local" value={activityDueDate} onChange={(e) => setActivityDueDate(e.target.value)} />
                        )}
                      </FormField>
                    </div>
                    <FormField label="Subject" className="mt-3">
                      {({ id }) => <Input id={id} value={activitySubject} onChange={(e) => setActivitySubject(e.target.value)} />}
                    </FormField>
                    <div className="mt-3 flex justify-end">
                      <Button type="button" onClick={scheduleActivity} isLoading={createActivity.isPending}>
                        Save activity
                      </Button>
                    </div>
                  </div>
                ) : null}

                <ul className="space-y-2">
                  {activities.map((a) => {
                    const overdue = Boolean(a.dueDate && new Date(a.dueDate).getTime() < Date.now() && a.status !== 'COMPLETED');
                    return (
                      <li key={a.id} className="rounded-md border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{a.subject}</p>
                            <p className="text-xs text-slate-500">
                              {a.type} • Due{' '}
                              <span className={overdue ? 'font-semibold text-red-600' : ''}>
                                {formatDateTime(a.dueDate)}
                              </span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              {a.status}
                            </span>
                            {a.status !== 'COMPLETED' ? (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => completeOpenActivity(a.id)}
                                isLoading={completeActivity.isPending}
                              >
                                Complete
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {activities.length === 0 ? (
                    <li className="text-sm text-slate-500">No activities for this deal.</li>
                  ) : null}
                </ul>
              </section>
            ) : null}

            {tab === 'notes' ? (
              <section className="space-y-3">
                <FormField label="Add note">
                  {({ id }) => (
                    <Textarea
                      id={id}
                      rows={2}
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      className="resize-y"
                      placeholder="Write a note..."
                    />
                  )}
                </FormField>
                <div className="flex justify-end">
                  <Button type="button" onClick={addNote} isLoading={createNote.isPending}>
                    Add note
                  </Button>
                </div>

                <ul className="space-y-2">
                  {sortedNotes.map((n) => {
                    const isAuthor = n.authorId === userId;
                    const editing = editingNoteId === n.id;
                    return (
                      <li key={n.id} className="group rounded-md border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            {n.isPinned ? (
                              <span className="mb-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                Pinned
                              </span>
                            ) : null}
                            {editing ? (
                              <Textarea rows={3} value={editingNoteContent} onChange={(e) => setEditingNoteContent(e.target.value)} />
                            ) : (
                              <p className="whitespace-pre-wrap text-sm text-slate-800">{n.content}</p>
                            )}
                            <p className="mt-1 text-xs text-slate-500">{relativeTime(n.createdAt)}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => pinNote.mutate({ id: n.id, pinned: !n.isPinned })}
                            >
                              {n.isPinned ? 'Unpin' : 'Pin'}
                            </Button>
                            {isAuthor ? (
                              <>
                                {editing ? (
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={async () => {
                                      await updateNote.mutateAsync({ id: n.id, data: { content: editingNoteContent } });
                                      setEditingNoteId(null);
                                    }}
                                  >
                                    Save
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingNoteId(n.id);
                                      setEditingNoteContent(n.content);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                )}
                                <Button type="button" variant="destructive" onClick={() => deleteNote.mutate(n.id)}>
                                  Delete
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {tab === 'quotes' ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900">Quotes</h2>
                  <Link href={`/quotes/new?dealId=${deal.id}`}>
                    <Button type="button">+ New Quote</Button>
                  </Link>
                </div>
                <div className="overflow-x-auto rounded-md border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Quote</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-center">Version</th>
                        <th className="px-3 py-2 text-left">Created</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotes.map((q) => (
                        <tr key={q.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium">{q.quoteNumber || q.name}</td>
                          <td className="px-3 py-2">
                            <QuoteStatusBadge status={q.status} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatCurrency((q as { total?: string }).total ?? 0, (q as { currency?: string }).currency ?? deal.currency)}
                          </td>
                          <td className="px-3 py-2 text-center">{(q as { version?: number }).version ?? 1}</td>
                          <td className="px-3 py-2">{formatDate((q as { createdAt?: string }).createdAt)}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex gap-1">
                              {q.status === 'DRAFT' ? (
                                <Button type="button" variant="secondary" onClick={() => sendQuote.mutate(q.id)}>
                                  Send
                                </Button>
                              ) : null}
                              {q.status === 'SENT' ? (
                                <>
                                  <Button type="button" variant="secondary" onClick={() => acceptQuote.mutate(q.id)}>
                                    Accept
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={() => {
                                      const reason = window.prompt('Rejection reason');
                                      if (reason) rejectQuote.mutate({ id: q.id, reason });
                                    }}
                                  >
                                    Reject
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {quotes.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                            No quotes yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </div>
        </section>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Deal info</h2>
            <div className="mt-3 space-y-2 text-sm">
              <p>
                <span className="text-slate-500">Owner:</span>{' '}
                {deal.owner?.firstName || deal.owner?.lastName
                  ? `${deal.owner?.firstName ?? ''} ${deal.owner?.lastName ?? ''}`.trim()
                  : deal.ownerId}
              </p>
              <p className={isOverdueClose ? 'font-medium text-red-600' : ''}>
                <span className="text-slate-500">Close date:</span> {formatDate(deal.expectedCloseDate)}
              </p>
              <div>
                <p className="text-slate-500">Probability</p>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.max(0, Math.min(100, deal.probability ?? 0))}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-600">{deal.probability ?? 0}%</p>
              </div>
              <p>
                <span className="text-slate-500">Forecast:</span>{' '}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">
                  {deal.forecastCategory}
                </span>
              </p>
              <p className="text-xs text-slate-500">Created {formatDateTime(deal.createdAt)}</p>
              <p className="text-xs text-slate-500">Updated {formatDateTime(deal.updatedAt)}</p>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Stage progression</h2>
            <div className="mt-3 space-y-2">
              {stageList.length > 0 ? (
                stageList.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onMoveStage(s.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                      deal.stageId === s.id
                        ? 'border-brand-600 bg-brand-50 text-brand-800'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {s.name}
                  </button>
                ))
              ) : (
                <p className="text-sm text-slate-500">No stage list available.</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Quick actions</h2>
            <div className="mt-3 grid gap-2">
              <Button
                type="button"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={deal.status === 'WON'}
                isLoading={markWon.isPending}
                onClick={() => markWon.mutate(deal.id)}
              >
                Mark Won
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deal.status === 'LOST'}
                isLoading={markLost.isPending}
                onClick={onMarkLost}
              >
                Mark Lost
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`/deals/${deal.id}/edit`)}
              >
                Edit
              </Button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Tags</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {(deal.tags ?? []).map((tag) => (
                <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {tag}
                </span>
              ))}
              {(deal.tags ?? []).length === 0 ? (
                <span className="text-sm text-slate-500">No tags</span>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm">
          {event.type === 'NOTE' ? '📝' : event.type === 'ACTIVITY' ? '📌' : '🔔'}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">{event.title}</p>
          {event.description ? <p className="mt-0.5 text-sm text-slate-600">{event.description}</p> : null}
          <p className="mt-1 text-xs text-slate-500">{relativeTime(event.at)}</p>
        </div>
        <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
          {(event.actorId ?? 'U').slice(0, 1).toUpperCase()}
        </div>
      </div>
    </div>
  );
}

function CircularScore({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(100, value));
  const circumference = 2 * Math.PI * 22;
  const offset = circumference - (normalized / 100) * circumference;
  return (
    <svg width="62" height="62" viewBox="0 0 62 62" role="img" aria-label={`MEDDIC score ${normalized}`}>
      <circle cx="31" cy="31" r="22" stroke="#e2e8f0" strokeWidth="7" fill="none" />
      <circle
        cx="31"
        cy="31"
        r="22"
        stroke={normalized >= 70 ? '#059669' : normalized >= 40 ? '#d97706' : '#dc2626'}
        strokeWidth="7"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 31 31)"
      />
      <text x="31" y="35" textAnchor="middle" className="fill-slate-900 text-xs font-bold">
        {normalized}
      </text>
    </svg>
  );
}

function StatusBadge({ status }: { status: Deal['status'] }) {
  const cls =
    status === 'WON'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'LOST'
        ? 'bg-red-100 text-red-800'
        : 'bg-blue-100 text-blue-800';
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{status}</span>;
}

function QuoteStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: 'bg-slate-100 text-slate-700',
    SENT: 'bg-blue-100 text-blue-800',
    ACCEPTED: 'bg-emerald-100 text-emerald-800',
    REJECTED: 'bg-red-100 text-red-800',
    EXPIRED: 'bg-amber-100 text-amber-800',
    VOID: 'bg-slate-200 text-slate-700',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colors[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {status}
    </span>
  );
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
  if (mins < 60) return `${mins || 1} minute${mins === 1 ? '' : 's'} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
