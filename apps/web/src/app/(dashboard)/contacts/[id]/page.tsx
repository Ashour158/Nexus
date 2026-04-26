'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Activity, Deal, Note, TimelineEvent } from '@nexus/shared-types';
import type { CreateActivityInput } from '@nexus/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';
import { apiClients } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  useContact,
  useContactDeals,
  useContactTimeline,
  useUpdateContact,
} from '@/hooks/use-contacts';
import { useAccount } from '@/hooks/use-accounts';
import {
  useActivities,
  useCompleteActivity,
  useCreateActivity,
  useDeleteActivity,
} from '@/hooks/use-activities';
import {
  useContactNotes,
  useCreateNote,
  useDeleteNote,
  usePinNote,
} from '@/hooks/use-notes';
import { useContactEmailThreads } from '@/hooks/use-email-threads';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { DocumentUpload } from '@/components/documents/DocumentUpload';

type TabId = 'overview' | 'timeline' | 'activities' | 'notes' | 'deals' | 'documents' | 'emails' | 'portal';

export default function ContactDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const contactId = params?.id ?? '';
  const userId = useAuthStore((s) => s.userId);
  const pushToast = useUiStore((s) => s.pushToast);

  const [tab, setTab] = useState<TabId>('overview');
  const [cadenceModalOpen, setCadenceModalOpen] = useState(false);
  const [selectedCadenceId, setSelectedCadenceId] = useState('');
  const contactQuery = useContact(contactId);
  const contact = contactQuery.data;
  const accountQuery = useAccount(contact?.accountId ?? '');
  const account = contact?.accountId ? accountQuery.data : undefined;

  const timelineQuery = useContactTimeline(contactId);
  const timelineEvents = useMemo(
    () => timelineQuery.data?.pages.flatMap((p) => p.events) ?? [],
    [timelineQuery.data]
  );

  const activitiesQuery = useActivities({ contactId, limit: 100, page: 1 });
  const activities = activitiesQuery.data?.data ?? [];

  const notesQuery = useContactNotes(contactId);
  const notes = notesQuery.data?.data ?? [];

  const dealsQuery = useContactDeals(contactId, { limit: 50, page: 1 });
  const deals = dealsQuery.data?.data ?? [];
  const emailThreadsQuery = useContactEmailThreads(contactId);
  const emailThreads = emailThreadsQuery.data ?? [];

  const updateContact = useUpdateContact();
  const createActivity = useCreateActivity();
  const completeActivity = useCompleteActivity();
  const deleteActivity = useDeleteActivity();
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();
  const pinNote = usePinNote();
  const cadencesQuery = useQuery({
    queryKey: ['cadence-picker', 'contact'],
    queryFn: () =>
      apiClients.cadence.get<
        Array<{ id: string; name: string; objectType: 'CONTACT' | 'LEAD'; stepCount?: number }>
      >('/cadences'),
    enabled: cadenceModalOpen,
  });
  const enrollInCadence = useMutation({
    mutationFn: () =>
      apiClients.cadence.post('/enrollments', {
        cadenceId: selectedCadenceId,
        objectType: 'CONTACT',
        objectId: contactId,
        ownerId: contact?.ownerId ?? userId ?? '',
      }),
    onSuccess: () => {
      pushToast({ variant: 'success', title: 'Contact enrolled in cadence' });
      setCadenceModalOpen(false);
      setSelectedCadenceId('');
    },
    onError: (err) =>
      pushToast({
        variant: 'error',
        title: 'Could not enroll contact',
        description: err instanceof Error ? err.message : 'Unknown error',
      }),
  });

  const [draft, setDraft] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    jobTitle: '',
    department: '',
  });

  useEffect(() => {
    if (!contact) return;
    setDraft({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      jobTitle: contact.jobTitle ?? '',
      department: contact.department ?? '',
    });
  }, [contact]);

  const [activityForm, setActivityForm] = useState<{
    type: CreateActivityInput['type'];
    subject: string;
    dueDate: string;
  }>({ type: 'TASK', subject: '', dueDate: '' });

  const [noteBody, setNoteBody] = useState('');

  function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!contact) return;
    updateContact.mutate(
      {
        id: contact.id,
        data: {
          firstName: draft.firstName.trim(),
          lastName: draft.lastName.trim(),
          email: draft.email.trim() || undefined,
          phone: draft.phone.trim() || undefined,
          jobTitle: draft.jobTitle.trim() || undefined,
          department: draft.department.trim() || undefined,
        },
      },
      {
        onSuccess: () =>
          pushToast({ variant: 'success', title: 'Contact updated' }),
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
    if (!contact || !userId) return;
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
        contactId: contact.id,
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
          timelineQuery.refetch();
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
    if (!contact) return;
    if (!noteBody.trim()) return;
    createNote.mutate(
      { content: noteBody.trim(), contactId: contact.id, isPinned: false },
      {
        onSuccess: () => {
          pushToast({ variant: 'success', title: 'Note added' });
          setNoteBody('');
          notesQuery.refetch();
          timelineQuery.refetch();
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

  if (contactQuery.isLoading) {
    return (
      <main className="px-6 py-6">
        <p className="text-sm text-slate-500">Loading contact…</p>
      </main>
    );
  }

  if (contactQuery.isError || !contact) {
    return (
      <main className="px-6 py-6">
        <p className="text-sm text-red-600">
          {contactQuery.error instanceof Error
            ? contactQuery.error.message
            : 'Contact not found'}
        </p>
        <Link href="/contacts" className="mt-2 inline-block text-sm text-slate-700 underline">
          Back to contacts
        </Link>
      </main>
    );
  }

  const fullName = `${contact.firstName} ${contact.lastName}`.trim();

  return (
    <main className="space-y-4 px-6 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link href="/contacts" className="hover:text-slate-800">
              Contacts
            </Link>
            <span>/</span>
            <span className="font-mono text-xs">{contact.id.slice(0, 8)}…</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{fullName}</h1>
          {contact.email ? (
            <p className="text-sm text-slate-600">{contact.email}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCadenceModalOpen(true)}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Enroll in Cadence
          </button>
          {contact.accountId ? (
            <Link
              href={`/accounts/${contact.accountId}`}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              {account?.name ?? 'View account'}
            </Link>
          ) : null}
        </div>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {(
          [
            ['overview', 'Overview'],
            ['timeline', 'Timeline'],
            ['activities', 'Activities'],
            ['notes', 'Notes'],
            ['deals', 'Deals'],
            ['documents', 'Documents'],
            ['emails', 'Emails'],
            ['portal', 'Portal'],
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
          onSubmit={onSaveProfile}
          className="max-w-2xl space-y-4 rounded-lg border border-slate-200 bg-white p-5"
        >
          <h2 className="text-sm font-semibold text-slate-900">Profile</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">First name</span>
              <Input
                value={draft.firstName}
                onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                className="mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-slate-600">Last name</span>
              <Input
                value={draft.lastName}
                onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                className="mt-1"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-xs font-medium text-slate-600">Email</span>
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
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
              <span className="text-xs font-medium text-slate-600">Job title</span>
              <Input
                value={draft.jobTitle}
                onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })}
                className="mt-1"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-xs font-medium text-slate-600">Department</span>
              <Input
                value={draft.department}
                onChange={(e) => setDraft({ ...draft, department: e.target.value })}
                className="mt-1"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={updateContact.isPending}>
              {updateContact.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
          <dl className="grid gap-2 border-t border-slate-100 pt-4 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-slate-400">Owner</dt>
              <dd className="font-mono text-xs">{contact.ownerId.slice(0, 12)}…</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-400">Created</dt>
              <dd>{formatDate(contact.createdAt)}</dd>
            </div>
          </dl>
        </form>
      ) : null}

      {tab === 'timeline' ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Timeline</h2>
          {timelineQuery.isLoading ? (
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
          {timelineQuery.hasNextPage ? (
            <Button
              type="button"
              variant="secondary"
              className="mt-4"
              onClick={() => timelineQuery.fetchNextPage()}
              disabled={timelineQuery.isFetchingNextPage}
            >
              {timelineQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
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
              placeholder="Capture context for the team…"
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
                <th className="px-3 py-2">Close</th>
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
                  <td className="px-3 py-2 text-slate-600">
                    {formatDate(d.expectedCloseDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {deals.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No linked deals.</p>
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
                  {(t.messages ?? []).length > 0 ? (
                    <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                      {(t.messages ?? []).slice(0, 5).map((m) => (
                        <div key={m.id} className="rounded bg-slate-50 p-2 text-xs">
                          <p className="font-medium">{m.fromEmail}</p>
                          <p className="text-slate-500">{m.subject}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2">
                    <Textarea rows={2} placeholder="Reply inline..." className="text-xs" />
                    <div className="mt-1 flex justify-end">
                      <Button type="button" variant="secondary" className="text-xs">
                        Send reply
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'documents' ? (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Contact documents</h2>
          <DocumentUpload />
        </section>
      ) : null}

      {tab === 'portal' ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Portal</h2>
          <p className="mt-2 text-sm text-slate-600">Manage this contact's portal access and permissions.</p>
          <Link href={`/contacts/${contact.id}/portal`} className="mt-3 inline-block text-sm font-medium text-blue-700 hover:underline">
            Open portal management
          </Link>
        </section>
      ) : null}

      {cadenceModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-lg font-semibold">Enroll in Cadence</h2>
              <p className="text-sm text-slate-500">Choose an active contact cadence.</p>
            </div>
            <div className="space-y-3 p-4">
              <select
                value={selectedCadenceId}
                onChange={(e) => setSelectedCadenceId(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select cadence…</option>
                {(cadencesQuery.data ?? [])
                  .filter((c) => c.objectType === 'CONTACT')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.stepCount ?? 0} steps)
                    </option>
                  ))}
              </select>
              {cadencesQuery.isLoading ? (
                <p className="text-sm text-slate-500">Loading cadences…</p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 p-3">
              <button
                type="button"
                onClick={() => setCadenceModalOpen(false)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedCadenceId || enrollInCadence.isPending}
                onClick={() => enrollInCadence.mutate()}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {enrollInCadence.isPending ? 'Enrolling…' : 'Enroll'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
