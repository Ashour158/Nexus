'use client';

import { useState } from 'react';

interface LogCallModalProps {
  contactId?: string;
  leadId?: string;
  accountId?: string;
  dealId?: string;
  onClose: () => void;
  onSaved: () => void;
}

const OUTCOMES = ['CONNECTED', 'NO_ANSWER', 'VOICEMAIL', 'BUSY', 'WRONG_NUMBER'];

export function LogCallModal({
  contactId,
  leadId,
  accountId,
  dealId,
  onClose,
  onSaved,
}: LogCallModalProps) {
  const [form, setForm] = useState({
    direction: 'OUTBOUND' as 'INBOUND' | 'OUTBOUND',
    durationSeconds: '',
    outcome: 'CONNECTED',
    notes: '',
    recordingUrl: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/crm/activities/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactId,
        leadId,
        accountId,
        dealId,
        direction: form.direction,
        durationSeconds: form.durationSeconds
          ? Number.parseInt(form.durationSeconds, 10)
          : undefined,
        outcome: form.outcome,
        notes: form.notes,
        recordingUrl: form.recordingUrl || undefined,
      }),
    });
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Log a Call</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Direction</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={form.direction}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    direction: e.target.value as 'INBOUND' | 'OUTBOUND',
                  }))
                }
              >
                <option value="OUTBOUND">Outbound</option>
                <option value="INBOUND">Inbound</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Outcome</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={form.outcome}
                onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))}
              >
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {o.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Duration (seconds)</label>
            <input
              type="number"
              placeholder="e.g. 180"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={form.durationSeconds}
              onChange={(e) => setForm((f) => ({ ...f, durationSeconds: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Notes</label>
            <textarea
              rows={3}
              placeholder="What was discussed?"
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Recording URL (optional)</label>
            <input
              type="url"
              placeholder="https://..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={form.recordingUrl}
              onChange={(e) => setForm((f) => ({ ...f, recordingUrl: e.target.value }))}
            />
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Log Call'}
          </button>
        </div>
      </div>
    </div>
  );
}
