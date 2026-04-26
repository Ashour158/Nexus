'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import type {
  Activity,
  Contact,
  Deal,
  Note,
  PaginatedResult,
  TimelineEvent,
} from '@nexus/shared-types';
import type { CreateActivityInput } from '@nexus/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { api } from '@/lib/api-client';
import {
  accountKeys,
  useAccount,
  useAccountContacts,
  useAccountDeals,
  useAccountHealth,
  useUpdateAccount,
} from '@/hooks/use-accounts';
import {
  useActivities,
  useCompleteActivity,
  useCreateActivity,
  useDeleteActivity,
} from '@/hooks/use-activities';
import {
  useCreateNote,
  useDeleteNote,
  useNotes,
  usePinNote,
} from '@/hooks/use-notes';
import { useAccountEmailThreads } from '@/hooks/use-email-threads';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';

type TabId = 'overview' | 'timeline' | 'activities' | 'notes' | 'deals' | 'emails';

function normalizeWebsiteForPatch(raw: string): string | undefined {
  const w = raw.trim();
  if (!w) return undefined;
  if (w.startsWith('http://') || w.startsWith('https://')) return w;
  return `https://${w}`;
}

export default function AccountDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const accountId = params?.id ?? '';
  const userId = useAuthStore((s) => s.userId);
  const pushToast = useUiStore((s) => s.pushToast);
  const [tab, setTab] = useState<TabId>('overview');

  const accountQuery = useAccount(accountId);
  const account = accountQuery.data;
  const healthQuery = useAccountHealth(accountId);
  const dealsQuery = useAccountDeals(accountId, { limit: 50, page: 1 });
  const contactsQuery = useAccountContacts(accountId, { limit: 25, page: 1 });
  const deals = dealsQuery.data?.data ?? [];
  const contacts = contactsQuery.data?.data ?? [];

  const timelineInfinite = useInfiniteQuery({
    queryKey: accountKeys.timeline(accountId, { limit: 20 }),
    queryFn: ({ pageParam }) =>
      api.get<PaginatedResult<TimelineEvent>>(`/accounts/${accountId}/timeline`, {
        params: { page: typeof pageParam === 'number' ? pageParam : 1, limit: 20 },
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNextPage ? last.page + 1 : undefined),
    enabled: Boolean(accountId && account),
  });
  const timelineEvents = useMemo(
    () => timelineInfinite.data?.pages.flatMap((p) => p.data) ?? [],
    [timelineInfinite.data]
  );

  const activitiesQuery = useActivities({ accountId, limit: 100, page: 1 });
  const activities = activitiesQuery.data?.data ?? [];

  const notesQuery = useNotes({ accountId, limit: 100, page: 1 });
  const notes = notesQuery.data?.data ?? [];
  const emailThreadsQuery = useAccountEmailThreads(accountId);
  const emailThreads = emailThreadsQuery.data ?? [];

  const updateAccount = useUpdateAccount();
  const createActivity = useCreateActivity();
  const completeActivity = useCompleteActivity();
  const deleteActivity = useDeleteActivity();
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();
  const pinNote = usePinNote();

  const [draft, setDraft] = useState({
    name: '',
    website: '',
    industry: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    if (!account) return;
    setDraft({
      name: account.name,
      website: account.website ?? '',
      industry: account.industry ?? '',
      phone: account.phone ?? '',
      email: account.email ?? '',
    });
  }, [account]);

  const [activityForm, setActivityForm] = useState<{
    type: CreateActivityInput['type'];
    subject: string;
    dueDate: string;
  }>({ type: 'TASK', subject: '', dueDate: '' });
  const [noteBody, setNoteBody] = useState('');

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    updateAccount.mutate(
      {
        id: account.id,
        data: {
          name: draft.name.trim(),
          website: normalizeWebsiteForPatch(draft.website),
          industry: draft.industry.trim() || undefined,
          phone: draft.phone.trim() || undefined,
          email: draft.email.trim() || undefined,
        },
      },
      {
        onSuccess: () =>
          pushToast({ variant: 'success', title: 'Account updated' }),
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Update failed',
            description: err.message,
          }),
      }
    );
  }

  function onCreateActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!account || !userId) return;
    if (!activityForm.subject.trim()) {
      pushToast({ variant: 'warning', title: 'Subject is required' });
      return;
    }
    createActivity.mutate(
      {
        type: activityForm.type,
        subject: activityForm.subject.trim(),
        priority: 'NORMAL',
        ownerId: userId,
        accountId: account.id,
        dueDate: activityForm.dueDate
          ? new Date(activityForm.dueDate).toISOString()
          : undefined,
        customFields: {},
      },
      {
        onSuccess: () => {
          pushToast({ variant: 'success', title: 'Activity created' });
          setActivityForm({ type: 'TASK', subject: '', dueDate: '' });
          activitiesQuery.refetch();
          timelineInfinite.refetch();
        },
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Could not create activity',
            description: err.message,
          }),
      }
    );
  }

  function onCreateNote(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    if (!noteBody.trim()) return;
    createNote.mutate(
      { content: noteBody.trim(), accountId: account.id, isPinned: false },
      {
        onSuccess: () => {
          pushToast({ variant: 'success', title: 'Note added' });
          setNoteBody('');
          notesQuery.refetch();
          timelineInfinite.refetch();
        },
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Could not save note',
            description: err.message,
          }),
      }
    );
  }

  if (accountQuery.isLoading) {
    return (
      <main className="px-6 py-6">
        <p className="text-sm text-slate-500">Loading account…</p>
      </main>
    );
  }

  if (accountQuery.isError || !account) {
    return (
      <main className="px-6 py-6">
        <p className="text-sm text-red-600">
          {accountQuery.error instanceof Error
            ? accountQuery.error.message
            : 'Account not found'}
        </p>
        <Link href="/accounts" className="mt-2 inline-block text-sm text-slate-700 underline">
          Back to accounts
        </Link>
      </main>
    );
  }

  const health = healthQuery.data;

  return (
    <main className="space-y-4 px-6 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link href="/accounts" className="hover:text-slate-800">
              Accounts
            </Link>
            <span>/</span>
            <span className="text-xs">{account.type} · {account.tier}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{account.name}</h1>
          {account.website ? (
            <a
              href={
                account.website.startsWith('http')
                  ? account.website
                  : `https://${account.website}`
              }
              target="_blank"
              rel="noreferrer"
              className="text-sm text-blue-700 hover:underline"
            >
              {account.website}
            </a>
          ) : null}
        </div>
        {health ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-right text-sm">
            <p className="text-xs uppercase text-slate-500">Health score</p>
            <p className="text-2xl font-bold text-slate-900">{health.score ?? '—'}</p>
          </div>
        ) : null}
      </header>

      {contacts.length > 0 ? (
        <section className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Key contacts</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {contacts.slice(0, 6).map((c: Contact) => (
              <li key={c.id}>
                <Link
                  href={`/contacts/${c.id}`}
                  className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs hover:bg-slate-50"
                >
                  {c.firstName} {c.lastName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {(
          [
            ['overview', 'Overview'],
            ['timeline', 'Timeline'],
            ['activities', 'Activities'],
            ['notes', 'Notes'],
            ['deals', 'Deals'],
            ['emails', 'Emails'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === id
                ? 'border-slate-900 font-semibold text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <form
          onSubmit={onSave}
          className="max-w-2xl space-y-4 rounded-lg border border-slate-200 bg-white p-5"
        >
          <h2 className="text-sm font-semibold text-slate-900">Company</h2>
          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-600">Name</span>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="mt-1"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">Website</span>
              <Input
                value={draft.website}
                onChange={(e) => setDraft({ ...draft, website: e.target.value })}
                className="mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">Industry</span>
              <Input
                value={draft.industry}
                onChange={(e) => setDraft({ ...draft, industry: e.target.value })}
                className="mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">Phone</span>
              <Input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                className="mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">Email</span>
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className="mt-1"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={updateAccount.isPending}>
              {updateAccount.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
          <dl className="grid gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-slate-400">Status</dt>
              <dd>{account.status}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400">Annual revenue</dt>
              <dd>
                {account.annualRevenue
                  ? formatCurrency(Number(account.annualRevenue))
                  : '—'}
              </dd>
            </div>
          </dl>
        </form>
      ) : null}

      {tab === 'timeline' ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Timeline</h2>
          {timelineInfinite.isLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading…</p>
          ) : timelineEvents.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No events yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {timelineEvents.map((ev: TimelineEvent) => (
                <li
                  key={ev.id}
                  className="border-l-2 border-slate-200 pl-3 text-sm"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium text-slate-900">{ev.title}</span>
                    <span className="text-xs text-slate-400">
                      {formatDateTime(ev.at)}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-600">
                      {ev.type}
                    </span>
                  </div>
                  {ev.description ? (
                    <p className="mt-1 whitespace-pre-wrap text-slate-600">
                      {ev.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {timelineInfinite.hasNextPage ? (
            <Button
              type="button"
              variant="secondary"
              className="mt-4"
              onClick={() => timelineInfinite.fetchNextPage()}
              disabled={timelineInfinite.isFetchingNextPage}
            >
              {timelineInfinite.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          ) : null}
        </section>
      ) : null}

      {tab === 'activities' ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <form
            onSubmit={onCreateActivity}
            className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 lg:col-span-1"
          >
            <h2 className="text-sm font-semibold text-slate-900">New activity</h2>
            <label className="block text-sm">
              <span className="text-xs text-slate-600">Type</span>
              <select
                value={activityForm.type}
                onChange={(e) =>
                  setActivityForm({
                    ...activityForm,
                    type: e.target.value as CreateActivityInput['type'],
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              >
                <option value="TASK">TASK</option>
                <option value="CALL">CALL</option>
                <option value="EMAIL">EMAIL</option>
                <option value="MEETING">MEETING</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs text-slate-600">Subject</span>
              <Input
                value={activityForm.subject}
                onChange={(e) =>
                  setActivityForm({ ...activityForm, subject: e.target.value })
                }
                className="mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-slate-600">Due</span>
              <Input
                type="datetime-local"
                value={activityForm.dueDate}
                onChange={(e) =>
                  setActivityForm({ ...activityForm, dueDate: e.target.value })
                }
                className="mt-1"
              />
            </label>
            <Button type="submit" disabled={createActivity.isPending} className="w-full">
              {createActivity.isPending ? 'Creating…' : 'Add activity'}
            </Button>
          </form>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white lg:col-span-2">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activities.map((a: Activity) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2 font-medium">{a.subject}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {formatDateTime(a.dueDate)}
                    </td>
                    <td className="px-3 py-2">{a.status}</td>
                    <td className="px-3 py-2 text-right">
                      {a.status !== 'COMPLETED' && a.status !== 'CANCELLED' ? (
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            className="rounded border border-slate-200 px-2 py-0.5 text-xs hover:bg-slate-50"
                            onClick={() =>
                              completeActivity.mutate(
                                { id: a.id, outcome: 'Completed' },
                                {
                                  onSuccess: () => {
                                    pushToast({
                                      variant: 'success',
                                      title: 'Completed',
                                    });
                                    activitiesQuery.refetch();
                                  },
                                }
                              )
                            }
                          >
                            Done
                          </button>
                          <button
                            type="button"
                            className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
                            onClick={() => {
                              if (!confirm('Remove this activity?')) return;
                              deleteActivity.mutate(a.id, {
                                onSuccess: () => activitiesQuery.refetch(),
                              });
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {activities.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">No activities.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'notes' ? (
        <div className="space-y-4">
          <form
            onSubmit={onCreateNote}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <h2 className="text-sm font-semibold text-slate-900">Add note</h2>
            <Textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={3}
              className="mt-2"
            />
            <div className="mt-2 flex justify-end">
              <Button type="submit" disabled={createNote.isPending}>
                Save note
              </Button>
            </div>
          </form>
          <ul className="space-y-2">
            {notes.map((n: Note) => (
              <li
                key={n.id}
                className="rounded-lg border border-slate-200 bg-white p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap text-slate-800">{n.content}</p>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="text-xs text-slate-600 hover:underline"
                      onClick={() =>
                        pinNote.mutate(
                          { id: n.id, pinned: !n.isPinned },
                          { onSuccess: () => notesQuery.refetch() }
                        )
                      }
                    >
                      {n.isPinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => {
                        if (!confirm('Delete this note?')) return;
                        deleteNote.mutate(n.id, {
                          onSuccess: () => notesQuery.refetch(),
                        });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {formatDateTime(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500">No notes yet.</p>
          ) : null}
        </div>
      ) : null}

      {tab === 'deals' ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Deal</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deals.map((d: Deal) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/deals/${d.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {d.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {d.currency} {d.amount}
                  </td>
                  <td className="px-3 py-2">{d.status}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500">
                    {d.stageId.slice(0, 8)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {deals.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No deals.</p>
          ) : null}
        </div>
      ) : null}

      {tab === 'emails' ? (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Email threads</h2>
          {emailThreadsQuery.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : emailThreads.length === 0 ? (
            <p className="text-sm text-slate-500">No email threads.</p>
          ) : (
            <ul className="space-y-2">
              {emailThreads.map((t) => (
                <li key={t.id} className="rounded border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{t.subject}</p>
                    {!t.isRead ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                        Unread
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{t.snippet ?? 'No snippet'}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDateTime(t.lastMessageAt)} · {t.messageCount} messages
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </main>
  );
}
