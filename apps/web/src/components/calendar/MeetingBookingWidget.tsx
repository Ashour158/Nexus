'use client';

import { useState } from 'react';

export function MeetingBookingWidget({ repUsername }: { repUsername: string }) {
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const slots = ['Mon 10:00', 'Mon 13:00', 'Tue 11:30', 'Wed 15:00'];

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h1 className="text-xl font-bold text-slate-900">Book a meeting with @{repUsername}</h1>
      <div className="grid gap-2 md:grid-cols-2">{slots.map((slot) => <button key={slot} onClick={() => setSelected(slot)} className={`rounded border px-3 py-2 text-sm ${selected === slot ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300'}`}>{slot}</button>)}</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
      <button onClick={() => window.alert('Meeting created and invite email sent.')} disabled={!selected || !name || !email} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Confirm booking</button>
    </section>
  );
}
