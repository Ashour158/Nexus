'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { useConnectorCatalog } from '@/hooks/use-integrations';
import { Modal } from '@/components/ui/modal';
import { CalendarDays } from 'lucide-react';
import {
  CRMCard,
  CRMEmptyState,
  CRMModuleShell,
  CRMPageHeader,
  CRMSidePanel,
  CRMStatusBadge,
} from '@/components/ui/crm';

type EventType = 'meeting' | 'task' | 'call' | 'deadline';

type CalendarEvent = {
  id: string;
  activityId: string;
  provider: string;
  externalId: string;
  syncedAt: string;
};

const TYPE_COLORS: Record<EventType, string> = {
  meeting: 'bg-primary-container text-on-primary-container',
  task: 'bg-warning-container text-on-warning-container',
  call: 'bg-success-container text-on-success-container',
  deadline: 'bg-error-container text-on-error-container',
};

export default function CalendarPage() {
  useEffect(() => {
    document.getElementById('hour-8')?.scrollIntoView({ block: 'start' });
  }, []);

  const qc = useQueryClient();
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState({ title: '', type: 'meeting' as EventType, date: '', time: '', duration: 30, attendees: '', deal: '', joinLink: '', notes: '', reminder: '15 min' });

  const events = useQuery({
    queryKey: ['calendar-events'],
    queryFn: () => apiClients.integration.get<CalendarEvent[]>('/integrations/calendar/events'),
  });

  // Real connection state for the status badge below. `undefined` while the
  // catalog is still loading, so the badge can say "checking" rather than
  // asserting either state before it knows.
  const connectors = useConnectorCatalog();
  const googleConnected = connectors.data
    ? connectors.data.some((c) => c.provider === 'google' && c.connected)
    : undefined;

  const sync = useMutation({
    mutationFn: () => apiClients.integration.post('/integrations/calendar/sync', {}),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['calendar-events'] }),
  });

  const create = useMutation({
    mutationFn: () => {
      const start = new Date(`${form.date}T${form.time}:00`);
      const end = new Date(start.getTime() + form.duration * 60_000);
      // The form collects attendees, deal, join link, notes, reminder and type,
      // but only title/start/end were ever sent — the rest were silently
      // discarded on submit, so a user filled in six fields that went nowhere.
      // The API already accepts description/location/videoLink/attendees; they
      // just were not being passed.
      const attendees = form.attendees
        .split(/[,;]/)
        .map((email) => email.trim())
        .filter(Boolean)
        .map((email) => ({ email }));

      // `type`, `reminder` and `deal` have no field on the calendar API. Rather
      // than drop them, fold them into the description so the information
      // reaches the invite instead of vanishing.
      const descriptionParts = [
        form.notes.trim(),
        form.deal.trim() ? `Deal: ${form.deal.trim()}` : '',
        form.type ? `Type: ${form.type}` : '',
        form.reminder ? `Reminder: ${form.reminder}` : '',
      ].filter(Boolean);

      return apiClients.integration.post('/integrations/calendar/events', {
        activityId: crypto.randomUUID(),
        summary: form.title,
        start: start.toISOString(),
        end: end.toISOString(),
        ...(descriptionParts.length ? { description: descriptionParts.join('\n') } : {}),
        ...(form.joinLink.trim() ? { videoLink: form.joinLink.trim() } : {}),
        ...(attendees.length ? { attendees } : {}),
      });
    },
    onSuccess: async () => {
      setShowCreate(false);
      await qc.invalidateQueries({ queryKey: ['calendar-events'] });
    },
  });

  const grouped = useMemo(() => {
    const list = events.data ?? [];
    const g = new Map<string, CalendarEvent[]>();
    for (const e of list) {
      const key = new Date(e.syncedAt).toISOString().slice(0, 10);
      if (!g.has(key)) g.set(key, []);
      g.get(key)?.push(e);
    }
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events.data]);

  return (
    <CRMModuleShell>
      <CRMPageHeader
        icon={CalendarDays}
        title="Calendar"
        description={`${view} view`}
        actions={<>
          <select value={view} onChange={(e) => setView(e.target.value as 'day' | 'week' | 'month')} className="rounded border border-outline-variant px-2 py-2 text-sm">
            <option value="day">Day</option><option value="week">Week</option><option value="month">Month</option>
          </select>
          <button onClick={() => setShowCreate(true)} className="rounded bg-primary px-3 py-2 text-sm font-medium text-on-primary">Create event</button>
        </>}
      />

      <CRMCard>
        <div className="mb-3 flex items-center justify-between rounded bg-surface-container-low p-3 text-sm">
          <div>
            <span className="font-medium">Google Calendar</span>{' '}
            {/* Derived from the connector catalog, not hardcoded. This badge
                previously read "Connected" as static text for everyone,
                including users who had never linked a calendar — so the page
                asserted a connection that did not exist and the Sync button
                appeared to be silently failing rather than having nothing to
                sync. */}
            {googleConnected === undefined ? (
              <CRMStatusBadge tone="slate">Checking…</CRMStatusBadge>
            ) : googleConnected ? (
              <CRMStatusBadge tone="emerald">Connected</CRMStatusBadge>
            ) : (
              <CRMStatusBadge tone="amber">Not connected</CRMStatusBadge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-on-surface-variant">Last synced: {events.data?.[0]?.syncedAt ? new Date(events.data[0].syncedAt).toLocaleString() : 'Never'}</span>
            <button onClick={() => sync.mutate()} className="rounded border border-outline-variant px-2 py-1" disabled={sync.isPending}>Sync</button>
            <Link href="/settings/integrations" className="rounded border border-outline-variant px-2 py-1">Integrations</Link>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {grouped.map(([date, list]) => (
            <div key={date} className="rounded border border-outline-variant p-3">
              <p className="text-sm font-semibold text-on-surface">{date}</p>
              <div className="mt-2 space-y-2">
                {list.map((event) => (
                  <button key={event.id} onClick={() => setSelected(event)} className="w-full rounded border border-outline-variant p-2 text-start hover:bg-surface-container-low">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{event.activityId.slice(0, 8)} - {event.externalId}</p>
                      <span className={`rounded px-2 py-0.5 text-xs ${TYPE_COLORS.meeting}`}>{event.provider}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {grouped.length === 0 ? (
            events.isLoading ? (
              <p className="text-sm text-on-surface-variant">Loading...</p>
            ) : (
              <CRMEmptyState
                icon={CalendarDays}
                title="Nothing scheduled"
                description="No meetings or tasks scheduled for this period"
                action={<button onClick={() => setShowCreate(true)}>+ Add Event</button>}
              />
            )
          ) : null}
        </div>
      </CRMCard>

      {view === 'week' ? (
        <CRMCard className="max-h-[420px] overflow-y-auto" title="Week working hours">
          <div className="space-y-0">
            {Array.from({ length: 24 }, (_, hour) => {
              const isWorkingHour = hour >= 8 && hour < 18;
              const label =
                hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
              return (
                <div
                  key={hour}
                  id={`hour-${hour}`}
                  className={`grid grid-cols-[80px_1fr] items-center border-b border-outline-variant py-2 ${isWorkingHour ? 'bg-surface' : 'bg-surface-container-low/60'}`}
                >
                  <span className={`px-2 text-xs ${isWorkingHour ? 'text-on-surface-variant' : 'text-outline'}`}>{label}</span>
                  <div className="h-8 rounded border border-dashed border-outline-variant" />
                </div>
              );
            })}
          </div>
        </CRMCard>
      ) : null}

      {selected ? (
        <CRMSidePanel title="Event details">
          <p className="mt-2 text-sm">Activity: {selected.activityId}</p>
          <p className="text-sm text-on-surface-variant">Provider: {selected.provider}</p>
          <p className="text-sm text-on-surface-variant">Synced: {new Date(selected.syncedAt).toLocaleString()}</p>
        </CRMSidePanel>
      ) : null}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create event" size="xl">
        <div className="mt-1 grid gap-2 md:grid-cols-2">
              <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" className="rounded border border-outline-variant px-3 py-2 text-sm" />
              <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as EventType }))} className="rounded border border-outline-variant px-3 py-2 text-sm"><option value="meeting">Meeting</option><option value="task">Task</option><option value="call">Call</option><option value="deadline">Deadline</option></select>
              <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="rounded border border-outline-variant px-3 py-2 text-sm" />
              <input type="time" value={form.time} onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))} className="rounded border border-outline-variant px-3 py-2 text-sm" />
              <input type="number" value={form.duration} onChange={(e) => setForm((p) => ({ ...p, duration: Number(e.target.value || 30) }))} placeholder="Duration" className="rounded border border-outline-variant px-3 py-2 text-sm" />
              <input value={form.attendees} onChange={(e) => setForm((p) => ({ ...p, attendees: e.target.value }))} placeholder="Attendees" className="rounded border border-outline-variant px-3 py-2 text-sm" />
              <input value={form.deal} onChange={(e) => setForm((p) => ({ ...p, deal: e.target.value }))} placeholder="Link to deal" className="rounded border border-outline-variant px-3 py-2 text-sm" />
              <input value={form.joinLink} onChange={(e) => setForm((p) => ({ ...p, joinLink: e.target.value }))} placeholder="Video link" className="rounded border border-outline-variant px-3 py-2 text-sm" />
              <select value={form.reminder} onChange={(e) => setForm((p) => ({ ...p, reminder: e.target.value }))} className="rounded border border-outline-variant px-3 py-2 text-sm"><option>15 min</option><option>1 hour</option><option>1 day</option></select>
              <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Description / agenda" className="rounded border border-outline-variant px-3 py-2 text-sm md:col-span-2" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setShowCreate(false)} className="rounded border border-outline-variant px-4 py-2 text-sm text-on-surface">Cancel</button>
          <button type="button" onClick={() => create.mutate()} disabled={!form.title || !form.date || !form.time || create.isPending} className="rounded bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-50">Save event</button>
        </div>
      </Modal>
    </CRMModuleShell>
  );
}
