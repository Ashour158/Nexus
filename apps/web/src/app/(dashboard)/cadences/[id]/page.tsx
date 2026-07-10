'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Mail, PauseCircle, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { notify } from '@/lib/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth.store';
import {
  useCadence,
  useCreateCadence,
  useUpdateCadence,
  type BackendCadenceStep,
} from '@/hooks/use-cadences';

const EmailStepEditor = dynamic(() => import('@/components/cadences/EmailStepEditor').then((m) => m.EmailStepEditor), { ssr: false, loading: () => <div className="h-[200px] animate-pulse rounded-lg bg-gray-100" /> });

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
  originalBackendType?: string;
};

const TOKENS = ['{{first_name}}', '{{company}}', '{{rep_name}}', '{{deal_value}}'];
const cadenceStepSchema = z.object({
  day: z.number().min(1, 'Day must be at least 1'),
  type: z.enum(['email', 'task', 'wait']),
  subject: z.string().optional(),
  waitDuration: z.number().optional(),
});

function mapBackendStepToFrontend(s: BackendCadenceStep): Step {
  const base: Step = {
    id: crypto.randomUUID(),
    type: 'email',
    day: s.position,
    originalBackendType: s.type,
  };

  switch (s.type) {
    case 'EMAIL':
      return {
        ...base,
        type: 'email',
        subject: s.subject ?? '',
        body: s.body ?? '',
        subjectB: typeof s.variantB?.subject === 'string' ? s.variantB.subject : undefined,
        bodyB: typeof s.variantB?.body === 'string' ? s.variantB.body : undefined,
        abTest: !!(s.variantB && (s.variantB.subject || s.variantB.body)),
        sendTime: '09:00',
        excludeWeekends: false,
      };
    case 'CALL_TASK':
      return {
        ...base,
        type: 'task',
        taskType: 'Call',
        instructions: s.taskTitle ?? s.body ?? '',
        dueOffset: 'same day',
      };
    case 'LINKEDIN_TASK':
      return {
        ...base,
        type: 'task',
        taskType: 'LinkedIn',
        instructions: s.taskTitle ?? s.body ?? '',
        dueOffset: 'same day',
      };
    case 'SMS':
      return {
        ...base,
        type: 'task',
        taskType: 'Custom',
        instructions: s.body ?? s.taskTitle ?? '',
        dueOffset: 'same day',
      };
    case 'WAIT':
      return {
        ...base,
        type: 'wait',
        waitDuration: s.delayDays ?? 1,
        waitUnit: 'days',
      };
    default:
      return base;
  }
}

function mapFrontendStepToBackend(s: Step): BackendCadenceStep {
  const base = {
    position: s.day,
  };

  switch (s.type) {
    case 'email':
      return {
        ...base,
        type: 'EMAIL' as const,
        subject: s.subject,
        body: s.body,
        variantB: s.abTest ? { subject: s.subjectB, body: s.bodyB } : undefined,
      };
    case 'task': {
      let backendType: BackendCadenceStep['type'] = 'CALL_TASK';
      if (s.taskType === 'LinkedIn') backendType = 'LINKEDIN_TASK';
      else if (s.originalBackendType === 'SMS' && s.taskType === 'Custom') backendType = 'SMS';
      return {
        ...base,
        type: backendType,
        taskTitle: s.instructions,
        body: s.instructions,
      };
    }
    case 'wait':
      return {
        ...base,
        type: 'WAIT' as const,
        delayDays: s.waitDuration ?? 0,
      };
    default:
      return { ...base, type: 'WAIT' as const, delayDays: s.waitDuration ?? 0 };
  }
}

export default function CadenceBuilderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';
  const isNew = id === 'new';
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRead = hasPermission('workflows:read');
  const { data: cadence, isLoading, error } = useCadence(isNew ? '' : id);
  const createMutation = useCreateCadence();
  const updateMutation = useUpdateCadence();

  const [steps, setSteps] = useState<Step[]>([
    { id: crypto.randomUUID(), type: 'email', day: 1, subject: 'Quick intro, {{first_name}}', body: 'Hi {{first_name}},\n\n...', sendTime: '09:30', excludeWeekends: true },
    { id: crypto.randomUUID(), type: 'wait', day: 2, waitDuration: 2, waitUnit: 'days' },
    { id: crypto.randomUUID(), type: 'task', day: 4, taskType: 'Call', instructions: 'Call and confirm interest', dueOffset: '+1 day' },
  ]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [name, setName] = useState('');
  const [sender, setSender] = useState('carlos@nexuscrm.app');
  const [exitConditions, setExitConditions] = useState<string[]>(['replied', 'unsubscribed']);
  const [goal, setGoal] = useState('meeting booked');
  const [enrollFrom, setEnrollFrom] = useState('contact list');
  const [objectType, setObjectType] = useState<'CONTACT' | 'LEAD'>('CONTACT');
  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;
    if (isNew) {
      setSteps([
        { id: crypto.randomUUID(), type: 'email', day: 1, subject: 'Quick intro, {{first_name}}', body: 'Hi {{first_name}},\n\n...', sendTime: '09:30', excludeWeekends: true },
        { id: crypto.randomUUID(), type: 'wait', day: 2, waitDuration: 2, waitUnit: 'days' },
        { id: crypto.randomUUID(), type: 'task', day: 4, taskType: 'Call', instructions: 'Call and confirm interest', dueOffset: '+1 day' },
      ]);
      setSelectedId('');
      setName('');
      setSender('carlos@nexuscrm.app');
      setExitConditions(['replied', 'unsubscribed']);
      setGoal('meeting booked');
      setEnrollFrom('contact list');
      setObjectType('CONTACT');
      setIsActive(true);
      setDescription('');
      setInitialized(true);
      return;
    }
    if (!cadence) return;
    setName(cadence.name);
    setDescription(cadence.description ?? '');
    setObjectType(cadence.objectType ?? 'CONTACT');
    setIsActive(cadence.isActive ?? true);
    const mappedSteps = (cadence.steps ?? []).map(mapBackendStepToFrontend);
    setSteps(mappedSteps);
    setSelectedId(mappedSteps[0]?.id ?? '');
    setExitConditions((prev) => {
      const backendConditions: string[] = [];
      if (cadence.exitOnReply) backendConditions.push('replied');
      if (cadence.exitOnMeeting) backendConditions.push('deal stage changed');
      const nonBackend = prev.filter((c) => c !== 'replied' && c !== 'deal stage changed');
      return Array.from(new Set([...nonBackend, ...backendConditions]));
    });
    setInitialized(true);
  }, [isNew, cadence, initialized]);

  const selected = useMemo(() => steps.find((s) => s.id === selectedId) ?? steps[0], [selectedId, steps]);

  if (!canRead) {
    return (
      <main className="p-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You do not have permission to view cadences.
        </div>
      </main>
    );
  }

  function updateStep(partial: Partial<Step>) {
    if (!selected) return;
    const merged = { ...selected, ...partial };
    const result = cadenceStepSchema.safeParse({
      day: merged.day,
      type: merged.type,
      subject: merged.subject,
      waitDuration: merged.waitDuration,
    });
    if (!result.success) {
      const next: Record<string, string> = {};
      result.error.errors.forEach((issue) => {
        const key = String(issue.path[0] ?? 'form');
        if (!next[key]) next[key] = issue.message;
      });
      setErrors(next);
      notify.error('Validation error', result.error.errors[0]?.message);
      return;
    }
    setErrors({});
    setSteps((prev) => prev.map((s) => s.id === selected.id ? merged : s));
  }

  function handleSave() {
    const payload = {
      name: name.trim() || 'Untitled cadence',
      description,
      objectType,
      isActive,
      exitOnReply: exitConditions.includes('replied'),
      exitOnMeeting: exitConditions.includes('deal stage changed'),
      steps: steps.map(mapFrontendStepToBackend),
    };
    if (isNew) {
      createMutation.mutate(payload, {
        onSuccess: (data) => {
          router.push(`/cadences/${data.id}`);
        },
      });
    } else {
      updateMutation.mutate({ id, data: payload });
    }
  }

  if (!isNew && isLoading) {
    return (
      <main className="grid gap-4 p-4 lg:grid-cols-12">
        <section className="space-y-2 lg:col-span-3 rounded-xl border border-slate-200 bg-white p-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </section>
        <section className="space-y-3 lg:col-span-6 rounded-xl border border-slate-200 bg-white p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-32" />
        </section>
        <aside className="space-y-3 lg:col-span-3 rounded-xl border border-slate-200 bg-white p-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </aside>
        <section className="lg:col-span-12 rounded-xl border border-slate-200 bg-white p-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-24 mt-2" />
        </section>
      </main>
    );
  }

  if (!isNew && error) {
    return (
      <main className="p-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          Failed to load cadence.{' '}
          <button onClick={() => window.location.reload()} className="underline">
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="grid gap-4 p-4 lg:grid-cols-12">
      <section className="space-y-2 lg:col-span-3 rounded-xl border border-slate-200 bg-white p-3">
        <h2 className="text-sm font-semibold text-slate-900">Step timeline</h2>
        {steps.map((step, idx) => (
          <div key={step.id} className={`rounded-lg border p-2 ${selected?.id === step.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}>
            <button onClick={() => setSelectedId(step.id)} className="w-full text-start">
              <p className="text-xs text-slate-500">Step {idx + 1} � Day {step.day}</p>
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
        {steps.length === 0 ? (
          <p className="text-sm text-slate-500">No steps yet. Add a step from the timeline to get started.</p>
        ) : (
          <>
            <label className="block text-sm">Step type<select value={selected?.type} onChange={(e) => updateStep({ type: e.target.value as StepType })} className="mt-1 w-full rounded border border-slate-300 px-2 py-2"><option value="email">Email</option><option value="task">Task</option><option value="wait">Wait</option></select></label>
            {errors.type ? <p className="text-xs text-red-500">{errors.type}</p> : null}

            {selected?.type === 'email' ? (
              <div className="space-y-2">
                <input value={selected.subject ?? ''} onChange={(e) => updateStep({ subject: e.target.value })} placeholder="Subject" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                {errors.subject ? <p className="text-xs text-red-500">{errors.subject}</p> : null}
                <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="From name / reply-to" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                <EmailStepEditor value={selected.body ?? ''} onChange={(html) => updateStep({ body: html })} />
                <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs">Tokens: {TOKENS.join(' � ')}</div>
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

            {selected?.type === 'task' ? (
              <div className="space-y-2">
                <select value={selected.taskType ?? 'Call'} onChange={(e) => updateStep({ taskType: e.target.value as Step['taskType'] })} className="w-full rounded border border-slate-300 px-3 py-2 text-sm"><option>Call</option><option>LinkedIn</option><option>Custom</option></select>
                <textarea value={selected.instructions ?? ''} onChange={(e) => updateStep({ instructions: e.target.value })} rows={6} placeholder="Instructions" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
                <select value={selected.dueOffset ?? 'same day'} onChange={(e) => updateStep({ dueOffset: e.target.value as Step['dueOffset'] })} className="w-full rounded border border-slate-300 px-3 py-2 text-sm"><option>same day</option><option>+1 day</option><option>+2 days</option></select>
              </div>
            ) : null}

            {selected?.type === 'wait' ? (
              <div className="grid gap-2 md:grid-cols-2">
                <input type="number" value={selected.waitDuration ?? 1} onChange={(e) => updateStep({ waitDuration: Number(e.target.value || 1) })} className="rounded border border-slate-300 px-3 py-2 text-sm" />
                {errors.waitDuration ? <p className="text-xs text-red-500">{errors.waitDuration}</p> : null}
                <select value={selected.waitUnit ?? 'days'} onChange={(e) => updateStep({ waitUnit: e.target.value as Step['waitUnit'] })} className="rounded border border-slate-300 px-3 py-2 text-sm"><option>hours</option><option>days</option><option>business days</option></select>
              </div>
            ) : null}
          </>
        )}
      </section>

      <aside className="space-y-3 lg:col-span-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Settings</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cadence name" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="Default sender" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
        <label className="text-xs uppercase text-slate-500">Exit conditions</label>
        <div className="space-y-1 text-sm">{['replied', 'bounced', 'deal stage changed', 'unsubscribed'].map((c) => <label key={c} className="flex items-center gap-2"><input type="checkbox" checked={exitConditions.includes(c)} onChange={(e) => setExitConditions((prev) => e.target.checked ? [...prev, c] : prev.filter((x) => x !== c))} />{c}</label>)}</div>
        <select value={goal} onChange={(e) => setGoal(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm"><option>meeting booked</option><option>demo completed</option><option>contact stage changed</option></select>
        <select value={enrollFrom} onChange={(e) => setEnrollFrom(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm"><option>contact list</option><option>deal stage</option><option>manually</option></select>
        <button
          onClick={handleSave}
          disabled={createMutation.isPending || updateMutation.isPending}
          className="w-full rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isNew ? 'Create cadence' : 'Save changes'}
        </button>
      </aside>

      <section className="lg:col-span-12 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Metrics panel</h2>
        <table className="min-w-full text-sm"><thead className="text-start text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-2">Step</th><th className="px-2 py-2">Sent</th><th className="px-2 py-2">Opened</th><th className="px-2 py-2">Clicked</th><th className="px-2 py-2">Replied</th><th className="px-2 py-2">Unsubscribed</th></tr></thead><tbody>{steps.map((s, i) => <tr key={s.id} className="border-t border-slate-100"><td className="px-2 py-2">Step {i + 1} � {s.type}</td><td className="px-2 py-2">{120 - i * 8}</td><td className="px-2 py-2">{70 - i * 6}</td><td className="px-2 py-2">{34 - i * 3}</td><td className="px-2 py-2">{18 - i * 2}</td><td className="px-2 py-2">{Math.max(0, 5 - i)}</td></tr>)}{steps.length===0?<tr><td colSpan={6} className="px-2 py-4 text-center text-slate-500">No steps yet.</td></tr>:null}</tbody></table>
      </section>
    </main>
  );
}
