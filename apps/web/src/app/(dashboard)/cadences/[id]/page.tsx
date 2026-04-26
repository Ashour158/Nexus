'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Mail, PauseCircle, Trash2 } from 'lucide-react';
import { EmailStepEditor } from '@/components/cadences/EmailStepEditor';

type StepType = 'email' | 'task' | 'wait';
type Step = {
  id: string;
  type: StepType;
  day: number;
  subject?: string;
  body?: string;
  subjectB?: string;
  bodyB?: string;
  abTest?: boolean;
  sendTime?: string;
  excludeWeekends?: boolean;
  taskType?: 'Call' | 'LinkedIn' | 'Custom';
  instructions?: string;
  dueOffset?: 'same day' | '+1 day' | '+2 days';
  waitUnit?: 'hours' | 'days' | 'business days';
  waitDuration?: number;
};

const TOKENS = ['{{first_name}}', '{{company}}', '{{rep_name}}', '{{deal_value}}'];

export default function CadenceBuilderPage() {
  const [steps, setSteps] = useState<Step[]>([
    { id: 's1', type: 'email', day: 1, subject: 'Quick intro, {{first_name}}', body: 'Hi {{first_name}},\n\n...', sendTime: '09:30', excludeWeekends: true },
    { id: 's2', type: 'wait', day: 2, waitDuration: 2, waitUnit: 'days' },
    { id: 's3', type: 'task', day: 4, taskType: 'Call', instructions: 'Call and confirm interest', dueOffset: '+1 day' },
  ]);
  const [selectedId, setSelectedId] = useState('s1');
  const [name, setName] = useState('Outbound Sequence A');
  const [sender, setSender] = useState('carlos@nexuscrm.app');
  const [exitConditions, setExitConditions] = useState(['replied', 'unsubscribed']);
  const [goal, setGoal] = useState('meeting booked');
  const [enrollFrom, setEnrollFrom] = useState('contact list');

  const selected = useMemo(() => steps.find((s) => s.id === selectedId) ?? steps[0], [selectedId, steps]);

  function updateStep(partial: Partial<Step>) {
    setSteps((prev) => prev.map((s) => s.id === selected.id ? { ...s, ...partial } : s));
  }

  return (
    <main className="grid gap-4 p-4 lg:grid-cols-12">
      <section className="space-y-2 lg:col-span-3 rounded-xl border border-slate-200 bg-white p-3">
        <h2 className="text-sm font-semibold text-slate-900">Step timeline</h2>
        {steps.map((step, idx) => (
          <div key={step.id} className={`rounded-lg border p-2 ${selected.id === step.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
            <button onClick={() => setSelectedId(step.id)} className="w-full text-left">
              <p className="text-xs text-slate-500">Step {idx + 1} ù Day {step.day}</p>
              <p className="text-sm font-medium capitalize flex items-center gap-1">{step.type === 'email' ? <Mail className="h-3.5 w-3.5" /> : step.type === 'task' ? '??' : <PauseCircle className="h-3.5 w-3.5" />}{step.type}</p>
              <p className="text-xs text-slate-500 truncate">{step.subject ?? step.instructions ?? `Wait ${step.waitDuration ?? 1} ${step.waitUnit ?? 'days'}`}</p>
            </button>
            <div className="mt-2 flex gap-1">
              <button onClick={() => idx > 0 && setSteps((prev) => { const n=[...prev]; [n[idx-1], n[idx]]=[n[idx], n[idx-1]]; return n; })} className="rounded border border-slate-200 p-1"><ArrowUp className="h-3 w-3" /></button>
              <button onClick={() => idx < steps.length - 1 && setSteps((prev) => { const n=[...prev]; [n[idx+1], n[idx]]=[n[idx], n[idx+1]]; return n; })} className="rounded border border-slate-200 p-1"><ArrowDown className="h-3 w-3" /></button>
              <button onClick={() => setSteps((prev) => prev.filter((s) => s.id !== step.id))} className="rounded border border-red-200 p-1 text-red-600"><Trash2 className="h-3 w-3" /></button>
            </div>
          </div>
        ))}
        <button onClick={() => setSteps((prev) => [...prev, { id: crypto.randomUUID(), type: 'email', day: prev.length + 1, subject: '' }])} className="w-full rounded border border-dashed border-slate-300 px-3 py-2 text-sm">+ Add step</button>
      </section>

      <section className="space-y-3 lg:col-span-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Step editor</h2>
        <label className="block text-sm">Step type<select value={selected.type} onChange={(e) => updateStep({ type: e.target.value as StepType })} className="mt-1 w-full rounded border border-slate-300 px-2 py-2"><option value="email">Email</option><option value="task">Task</option><option value="wait">Wait</option></select></label>

        {selected.type === 'email' ? (
          <div className="space-y-2">
            <input value={selected.subject ?? ''} onChange={(e) => updateStep({ subject: e.target.value })} placeholder="Subject" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="From name / reply-to" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            <EmailStepEditor value={selected.body ?? ''} onChange={(html) => updateStep({ body: html })} />
            <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs">Tokens: {TOKENS.join(' ù ')}</div>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.abTest ?? false} onChange={(e) => updateStep({ abTest: e.target.checked })} />Enable A/B test</label>
            {selected.abTest ? (
              <>
                <input value={selected.subjectB ?? ''} onChange={(e) => updateStep({ subjectB: e.target.value })} placeholder="Subject B" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                <textarea value={selected.bodyB ?? ''} onChange={(e) => updateStep({ bodyB: e.target.value })} rows={6} placeholder="Body B" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
              </>
            ) : null}
            <div className="grid gap-2 md:grid-cols-2">
              <input type="time" value={selected.sendTime ?? '09:00'} onChange={(e) => updateStep({ sendTime: e.target.value })} className="rounded border border-slate-300 px-3 py-2 text-sm" />
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.excludeWeekends ?? false} onChange={(e) => updateStep({ excludeWeekends: e.target.checked })} />Exclude weekends</label>
            </div>
          </div>
        ) : null}

        {selected.type === 'task' ? (
          <div className="space-y-2">
            <select value={selected.taskType ?? 'Call'} onChange={(e) => updateStep({ taskType: e.target.value as Step['taskType'] })} className="w-full rounded border border-slate-300 px-3 py-2 text-sm"><option>Call</option><option>LinkedIn</option><option>Custom</option></select>
            <textarea value={selected.instructions ?? ''} onChange={(e) => updateStep({ instructions: e.target.value })} rows={6} placeholder="Instructions" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            <select value={selected.dueOffset ?? 'same day'} onChange={(e) => updateStep({ dueOffset: e.target.value as Step['dueOffset'] })} className="w-full rounded border border-slate-300 px-3 py-2 text-sm"><option>same day</option><option>+1 day</option><option>+2 days</option></select>
          </div>
        ) : null}

        {selected.type === 'wait' ? (
          <div className="grid gap-2 md:grid-cols-2">
            <input type="number" value={selected.waitDuration ?? 1} onChange={(e) => updateStep({ waitDuration: Number(e.target.value || 1) })} className="rounded border border-slate-300 px-3 py-2 text-sm" />
            <select value={selected.waitUnit ?? 'days'} onChange={(e) => updateStep({ waitUnit: e.target.value as Step['waitUnit'] })} className="rounded border border-slate-300 px-3 py-2 text-sm"><option>hours</option><option>days</option><option>business days</option></select>
          </div>
        ) : null}
      </section>

      <aside className="space-y-3 lg:col-span-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Settings</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cadence name" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="Default sender" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        <label className="text-xs uppercase text-slate-500">Exit conditions</label>
        <div className="space-y-1 text-sm">{['replied', 'bounced', 'deal stage changed', 'unsubscribed'].map((c) => <label key={c} className="flex items-center gap-2"><input type="checkbox" checked={exitConditions.includes(c)} onChange={(e) => setExitConditions((prev) => e.target.checked ? [...prev, c] : prev.filter((x) => x !== c))} />{c}</label>)}</div>
        <select value={goal} onChange={(e) => setGoal(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm"><option>meeting booked</option><option>demo completed</option><option>contact stage changed</option></select>
        <select value={enrollFrom} onChange={(e) => setEnrollFrom(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm"><option>contact list</option><option>deal stage</option><option>manually</option></select>
      </aside>

      <section className="lg:col-span-12 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Metrics panel</h2>
        <table className="min-w-full text-sm"><thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-2">Step</th><th className="px-2 py-2">Sent</th><th className="px-2 py-2">Opened</th><th className="px-2 py-2">Clicked</th><th className="px-2 py-2">Replied</th><th className="px-2 py-2">Unsubscribed</th></tr></thead><tbody>{steps.map((s, i) => <tr key={s.id} className="border-t border-slate-100"><td className="px-2 py-2">Step {i + 1} ù {s.type}</td><td className="px-2 py-2">{120 - i * 8}</td><td className="px-2 py-2">{70 - i * 6}</td><td className="px-2 py-2">{34 - i * 4}</td><td className="px-2 py-2">{16 - i * 2}</td><td className="px-2 py-2">{2 + i}</td></tr>)}</tbody></table>
      </section>
    </main>
  );
}
