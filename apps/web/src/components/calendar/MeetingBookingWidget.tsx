'use client';

import { useState } from 'react';

export function MeetingBookingWidget({ repUsername }: { repUsername: string }) {
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const slots = ['Mon 10:00', 'Mon 13:00', 'Tue 11:30', 'Wed 15:00'];

  return (
    <section className="space-y-3 rounded-xl border border-outline-variant bg-surface p-4">
      <h1 className="text-xl font-bold text-on-surface">Book a meeting with @{repUsername}</h1>
      <div className="grid gap-2 md:grid-cols-2">{slots.map((slot) => <button key={slot} onClick={() => setSelected(slot)} className={`rounded border px-3 py-2 text-sm ${selected === slot ? 'border-primary bg-primary-container text-primary' : 'border-outline-variant'}`}>{slot}</button>)}</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full rounded border border-outline-variant px-3 py-2 text-sm" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" className="w-full rounded border border-outline-variant px-3 py-2 text-sm" />
      <button onClick={() => { console.log('Meeting created and invite email sent.'); }} disabled={!selected || !name || !email} className="rounded bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Confirm booking</button>
    </section>
  );
}
