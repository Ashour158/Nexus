'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PhoneOutgoing, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';
import { LogCallModal } from '@/components/crm/LogCallModal';

interface DetailQuickActionsProps {
  contactId?: string;
  accountId?: string;
  /** react-query keys to invalidate after a call/note is logged (e.g. timeline, activities). */
  invalidateKeys?: unknown[][];
}

/**
 * Inline "Log Call" + quick "Add Note" actions for account/contact detail
 * action rows. Log-a-call posts to /api/crm/activities/call (via LogCallModal);
 * add-note posts to the generic /api/notes endpoint with accountId/contactId set.
 */
export function DetailQuickActions({ contactId, accountId, invalidateKeys = [] }: DetailQuickActionsProps) {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const [logCallOpen, setLogCallOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const invalidate = () => {
    for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key });
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: note.trim(), contactId, accountId }),
      });
      if (!res.ok) throw new Error('Failed to save note');
      notify.success('Note added');
      setNote('');
      setNoteOpen(false);
      invalidate();
    } catch (err) {
      notify.error('Could not add note', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setLogCallOpen(true)}>
        <PhoneOutgoing className="h-4 w-4" />
        Log Call
      </Button>
      <Button variant="secondary" onClick={() => setNoteOpen((o) => !o)}>
        <StickyNote className="h-4 w-4" />
        Add Note
      </Button>

      {noteOpen ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <textarea
            autoFocus
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Quick note…"
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-blue-500"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setNoteOpen(false);
                setNote('');
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveNote}
              disabled={saving || !note.trim()}
              className="rounded-lg bg-[#137fec] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Note'}
            </button>
          </div>
        </div>
      ) : null}

      {logCallOpen ? (
        <LogCallModal
          contactId={contactId}
          accountId={accountId}
          onClose={() => setLogCallOpen(false)}
          onSaved={() => {
            notify.success('Call logged');
            invalidate();
          }}
        />
      ) : null}
    </>
  );
}
