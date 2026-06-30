'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Note } from '@nexus/shared-types';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Textarea } from '@/components/ui/textarea';
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from '@/hooks/use-notes';
import { useUsers } from '@/hooks/use-users';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';

type NoteTab = 'all' | 'pinned';

export default function NotesPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRead = hasPermission('notes:read');
  const { confirm, ConfirmDialog } = useConfirm();
  const [tab, setTab] = useState<NoteTab>('all');
  const [dealId, setDealId] = useState('');
  const [contactId, setContactId] = useState('');
  const [leadId, setLeadId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Note | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [draftPinned, setDraftPinned] = useState(false);
  const [draftDealId, setDraftDealId] = useState('');
  const [draftContactId, setDraftContactId] = useState('');
  const [draftLeadId, setDraftLeadId] = useState('');
  const [draftAccountId, setDraftAccountId] = useState('');

  const notesQuery = useNotes({
    page,
    limit: 25,
    dealId: dealId || undefined,
    contactId: contactId || undefined,
    leadId: leadId || undefined,
    accountId: accountId || undefined,
    authorId: authorId || undefined,
    isPinned: tab === 'pinned' ? true : undefined,
  });

  const usersQuery = useUsers({ limit: 200 });
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  if (!canRead) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          You do not have permission to view notes.
        </div>
      </div>
    );
  }

  const notes = notesQuery.data?.data ?? [];
  const owners = usersQuery.data?.data ?? [];

  function startCreate() {
    setEditing(null);
    setDraftContent('');
    setDraftPinned(false);
    setDraftDealId('');
    setDraftContactId('');
    setDraftLeadId('');
    setDraftAccountId('');
  }

  function startEdit(note: Note) {
    setEditing(note);
    setDraftContent(note.content);
    setDraftPinned(note.isPinned);
    setDraftDealId(note.dealId ?? '');
    setDraftContactId(note.contactId ?? '');
    setDraftLeadId(note.leadId ?? '');
    setDraftAccountId(note.accountId ?? '');
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      content: draftContent.trim(),
      isPinned: draftPinned,
      mentions: [] as string[],
      dealId: draftDealId.trim() || undefined,
      contactId: draftContactId.trim() || undefined,
      leadId: draftLeadId.trim() || undefined,
      accountId: draftAccountId.trim() || undefined,
    };
    if (!payload.content) return;

    if (editing) {
      updateNote.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => {
            setEditing(null);
            setDraftContent('');
          },
        }
      );
    } else {
      createNote.mutate(payload, {
        onSuccess: () => {
          setDraftContent('');
          setDraftPinned(false);
          setDraftDealId('');
          setDraftContactId('');
          setDraftLeadId('');
          setDraftAccountId('');
        },
      });
    }
  }

  const tabs: { id: NoteTab; label: string }[] = [
    { id: 'all', label: 'All Notes' },
    { id: 'pinned', label: 'Pinned' },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Notes</h1>
        <Button onClick={startCreate}>New Note</Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setTab(t.id); setPage(1); }}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition',
              tab === t.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={dealId}
          onChange={(e) => { setDealId(e.target.value); setPage(1); }}
          placeholder="Deal ID"
          className="h-9 w-40 rounded-md border border-slate-200 px-3 text-sm"
        />
        <input
          type="text"
          value={contactId}
          onChange={(e) => { setContactId(e.target.value); setPage(1); }}
          placeholder="Contact ID"
          className="h-9 w-40 rounded-md border border-slate-200 px-3 text-sm"
        />
        <input
          type="text"
          value={leadId}
          onChange={(e) => { setLeadId(e.target.value); setPage(1); }}
          placeholder="Lead ID"
          className="h-9 w-40 rounded-md border border-slate-200 px-3 text-sm"
        />
        <input
          type="text"
          value={accountId}
          onChange={(e) => { setAccountId(e.target.value); setPage(1); }}
          placeholder="Account ID"
          className="h-9 w-40 rounded-md border border-slate-200 px-3 text-sm"
        />
        <select
          value={authorId}
          onChange={(e) => { setAuthorId(e.target.value); setPage(1); }}
          className="h-9 rounded-md border border-slate-200 px-2 text-sm"
        >
          <option value="">All authors</option>
          {owners.map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={onSubmit} className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <Textarea
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          placeholder={editing ? 'Edit note…' : 'Write a new note…'}
          className="mb-3"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={draftPinned}
              onChange={(e) => setDraftPinned(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Pinned
          </label>
          <input
            type="text"
            value={draftDealId}
            onChange={(e) => setDraftDealId(e.target.value)}
            placeholder="Deal ID"
            className="h-8 w-32 rounded-md border border-slate-200 px-2 text-xs"
          />
          <input
            type="text"
            value={draftContactId}
            onChange={(e) => setDraftContactId(e.target.value)}
            placeholder="Contact ID"
            className="h-8 w-32 rounded-md border border-slate-200 px-2 text-xs"
          />
          <input
            type="text"
            value={draftLeadId}
            onChange={(e) => setDraftLeadId(e.target.value)}
            placeholder="Lead ID"
            className="h-8 w-32 rounded-md border border-slate-200 px-2 text-xs"
          />
          <input
            type="text"
            value={draftAccountId}
            onChange={(e) => setDraftAccountId(e.target.value)}
            placeholder="Account ID"
            className="h-8 w-32 rounded-md border border-slate-200 px-2 text-xs"
          />
          <div className="ms-auto flex gap-2">
            {editing && (
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            )}
            <Button type="submit" isLoading={createNote.isPending || updateNote.isPending}>
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </div>
      </form>

      {notesQuery.isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <EmptyState icon="📝" title="No notes found" description="Try adjusting filters or create a new note." />
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{note.content}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                    {note.isPinned && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">📌 Pinned</span>}
                    {note.dealId && (
                      <span>
                        Deal: <Link href={`/deals/${note.dealId}`} className="text-brand-700 hover:underline">{note.dealId.slice(0, 8)}</Link>
                      </span>
                    )}
                    {note.contactId && (
                      <span>
                        Contact: <Link href={`/contacts/${note.contactId}`} className="text-brand-700 hover:underline">{note.contactId.slice(0, 8)}</Link>
                      </span>
                    )}
                    {note.leadId && (
                      <span>
                        Lead: <Link href={`/leads/${note.leadId}`} className="text-brand-700 hover:underline">{note.leadId.slice(0, 8)}</Link>
                      </span>
                    )}
                    {note.accountId && (
                      <span>
                        Account: <Link href={`/accounts/${note.accountId}`} className="text-brand-700 hover:underline">{note.accountId.slice(0, 8)}</Link>
                      </span>
                    )}
                    <span>{formatDate(note.createdAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(note)}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (await confirm('Delete this note?', 'Delete Note')) deleteNote.mutate(note.id);
                    }}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {ConfirmDialog}
      {notesQuery.data && (
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span>
            Page {notesQuery.data.page} of {notesQuery.data.totalPages} · {notesQuery.data.total} total
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-50"
              disabled={!notesQuery.data.hasPrevPage}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <button
              type="button"
              className="rounded border border-slate-200 px-2 py-1 disabled:opacity-50"
              disabled={!notesQuery.data.hasNextPage}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
