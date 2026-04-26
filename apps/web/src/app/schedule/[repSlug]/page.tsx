'use client';

import { useEffect, useMemo, useState, type JSX } from 'react';
import { useParams } from 'next/navigation';

interface AvailabilityResponse {
  rep: {
    id: string;
    tenantId: string;
    firstName: string;
    lastName: string;
    email: string;
    timezone: string;
  };
  slots: string[];
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

export default function SchedulerPage(): JSX.Element {
  const params = useParams<{ repSlug: string }>();
  const repSlug = params?.repSlug ?? '';
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const authUrl = process.env.NEXT_PUBLIC_AUTH_URL ?? 'http://localhost:3010/api/v1';
    void fetch(`${authUrl}/users/${encodeURIComponent(repSlug)}/availability`)
      .then((res) => res.json() as Promise<Envelope<AvailabilityResponse>>)
      .then((body) => {
        if (body.success) {
          setAvailability(body.data);
          setSelectedDate(body.data.slots[0]?.slice(0, 10) ?? '');
        }
      })
      .catch(() => setStatus('Could not load availability.'));
  }, [repSlug]);

  const dates = useMemo(
    () => Array.from(new Set((availability?.slots ?? []).map((s) => s.slice(0, 10)))),
    [availability]
  );
  const slots = useMemo(
    () => (availability?.slots ?? []).filter((s) => s.startsWith(selectedDate)),
    [availability, selectedDate]
  );

  async function book() {
    if (!availability || !selectedSlot || !customerName || !customerEmail) {
      setStatus('Choose a slot and enter your name and email.');
      return;
    }
    setStatus('Booking meeting…');
    const crmUrl = process.env.NEXT_PUBLIC_CRM_URL ?? 'http://localhost:3001/api/v1';
    const integrationUrl =
      process.env.NEXT_PUBLIC_INTEGRATION_URL ?? 'http://localhost:3012/api/v1';
    const start = new Date(selectedSlot);
    const end = new Date(start.getTime() + 30 * 60_000);
    const activityRes = await fetch(`${crmUrl}/activities/public-meeting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: availability.rep.tenantId,
        ownerId: availability.rep.id,
        subject: `Meeting with ${customerName}`,
        description: `Booked by ${customerName} <${customerEmail}>`,
        dueDate: start.toISOString(),
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        duration: 30,
        customerName,
        customerEmail,
      }),
    });
    const activityBody = (await activityRes.json()) as Envelope<{ id: string }>;
    if (!activityRes.ok || !activityBody.success) {
      setStatus('Could not create the meeting. Please contact the rep directly.');
      return;
    }
    await fetch(`${integrationUrl}/integrations/calendar/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: availability.rep.tenantId,
        userId: availability.rep.id,
        activityId: activityBody.data.id,
        summary: `Meeting with ${customerName}`,
        start: start.toISOString(),
        end: end.toISOString(),
      }),
    }).catch(() => undefined);
    setStatus('Meeting booked. Check your email for details.');
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <p className="text-sm uppercase tracking-wide text-slate-500">Nexus Scheduler</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          Book a meeting{availability ? ` with ${availability.rep.firstName}` : ''}
        </h1>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {dates.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setSelectedDate(d);
                setSelectedSlot('');
              }}
              className={`rounded-md border px-3 py-2 text-sm ${
                selectedDate === d ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200'
              }`}
            >
              {new Date(d).toLocaleDateString()}
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {slots.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => setSelectedSlot(slot)}
              className={`rounded-md border px-3 py-2 text-sm ${
                selectedSlot === slot
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200'
              }`}
            >
              {new Date(slot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Your name"
          className="rounded-md border border-slate-200 px-3 py-2 text-sm"
        />
        <input
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          placeholder="you@example.com"
          type="email"
          className="rounded-md border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={book}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          Book selected slot
        </button>
        {status ? <p className="text-sm text-slate-600">{status}</p> : null}
      </section>
    </main>
  );
}
