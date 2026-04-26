'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClients } from '@/lib/api-client';
import { Modal } from '@/components/ui/modal';

type EventType = 'meeting' | 'task' | 'call' | 'deadline';

type CalendarEvent = {
  id: string;
  activityId: string;
  provider: string;
  externalId: string;
  syncedAt: string;
};

const TYPE_COLORS: Record<EventType, string> = {
  meeting: 'bg-blue-100 text-blue-800',
  task: 'bg-orange-100 text-orange-800',
  call: 'bg-emerald-100 text-emerald-800',
  deadline: 'bg-red-100 text-red-800',
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

  const sync = useMutation({
    mutationFn: () => apiClients.integration.post('/integrations/calendar/sync', {}),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ['calendar-events'] }),
  });

  const create = useMutation({
    mutationFn: () => {
      const start = new Date(`${form.date}T${form.time}:00`);
      const end = new Date(start.getTime() + form.duration * 60_000);
      return apiClients.integration.post('/integrations/calendar/events', {
        activityId: crypto.randomUUID(),
        summary: form.title,
        start: start.toISOString(),
        end: end.toISOString(),
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
    <main className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
          <p className="text-sm text-slate-500">{view} view</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={view} onChange={(e) => setView(e.target.value as 'day' | 'week' | 'month')} className="rounded border border-slate-300 px-2 py-2 text-sm">
            <option value="day">Day</option><option value="week">Week</option><option value="month">Month</option>
          </select>
          <button onClick={() => setShowCreate(true)} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white">Create event</button>
        </div>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between rounded bg-slate-50 p-3 text-sm">
          <div>
            <span className="font-medium">Google Calendar</span>{' '}
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Connected</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Last synced: {events.data?.[0]?.syncedAt ? new Date(events.data[0].syncedAt).toLocaleString() : 'Never'}</span>
            <button onClick={() => sync.mutate()} className="rounded border border-slate-300 px-2 py-1" disabled={sync.isPending}>Sync</button>
            <Link href="/settings/integrations" className="rounded border border-slate-300 px-2 py-1">Integrations</Link>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {grouped.map(([date, list]) => (
            <div key={date} className="rounded border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">{date}</p>
              <div className="mt-2 space-y-2">
                {list.map((event) => (
                  <button key={event.id} onClick={() => setSelected(event)} className="w-full rounded border border-slate-200 p-2 text-left hover:bg-slate-50">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{event.activityId.slice(0, 8)} - {event.externalId}</p>
                      <span className={`rounded px-2 py-0.5 text-xs ${TYPE_COLORS.meeting}`}>{event.provider}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {grouped.length === 0 ? <p className="text-sm text-slate-500">{events.isLoading ? 'Loading...' : 'No synced events yet.'}</p> : null}
        </div>
      </section>

      {view === 'week' ? (
        <section className="max-h-[420px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Week working hours</h2>
          <div className="space-y-0">
            {Array.from({ length: 24 }, (_, hour) => {
              const isWorkingHour = hour >= 8 && hour < 18;
              const label =
                hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
              return (
                <div
                  key={hour}
                  id={`hour-${hour}`}
                  className={`grid grid-cols-[80px_1fr] items-center border-b border-gray-100 py-2 ${isWorkingHour ? 'bg-white' : 'bg-gray-50/60'}`}
                >
                  <span className={`px-2 text-xs ${isWorkingHour ? 'text-gray-600' : 'text-gray-300'}`}>{label}</span>
                  <div className="h-8 rounded border border-dashed border-gray-100" />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {selected ? (
        <aside className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Event details</h2>
          <p className="mt-2 text-sm">Activity: {selected.activityId}</p>
          <p className="text-sm text-slate-600">Provider: {selected.provider}</p>
          <p className="text-sm text-slate-600">Synced: {new Date(selected.syncedAt).toLocaleString()}</p>
        </aside>
      ) : null}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create event" size="xl">
        <div className="mt-1 grid gap-2 md:grid-cols-2">
              <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" className="rounded border border-slate-300 px-3 py-2 text-sm" />
              <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as EventType }))} className="rounded border border-slate-300 px-3 py-2 text-sm"><option value="meeting">Meeting</option><option value="task">Task</option><option value="call">Call</option><option value="deadline">Deadline</option></select>
              <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="rounded border border-slate-300 px-3 py-2 text-sm" />
              <input type="time" value={form.time} onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))} className="rounded border border-slate-300 px-3 py-2 text-sm" />
              <input type="number" value={form.duration} onChange={(e) => setForm((p) => ({ ...p, duration: Number(e.target.value || 30) }))} placeholder="Duration" className="rounded border border-slate-300 px-3 py-2 text-sm" />
              <input value={form.attendees} onChange={(e) => setForm((p) => ({ ...p, attendees: e.target.value }))} placeholder="Attendees" className="rounded border border-slate-300 px-3 py-2 text-sm" />
              <input value={form.deal} onChange={(e) => setForm((p) => ({ ...p, deal: e.target.value }))} placeholder="Link to deal" className="rounded border border-slate-300 px-3 py-2 text-sm" />
              <input value={form.joinLink} onChange={(e) => setForm((p) => ({ ...p, joinLink: e.target.value }))} placeholder="Video link" className="rounded border border-slate-300 px-3 py-2 text-sm" />
              <select value={form.reminder} onChange={(e) => setForm((p) => ({ ...p, reminder: e.target.value }))} className="rounded border border-slate-300 px-3 py-2 text-sm"><option>15 min</option><option>1 hour</option><option>1 day</option></select>
              <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Description / agenda" className="md:col-span-2 rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={() => setShowCreate(false)} className="rounded border border-slate-300 px-3 py-2 text-sm">Cancel</button>
          <button onClick={() => create.mutate()} disabled={!form.title || !form.date || !form.time || create.isPending} className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">Save</button>
        </div>
      </Modal>
    </main>
  );
}
