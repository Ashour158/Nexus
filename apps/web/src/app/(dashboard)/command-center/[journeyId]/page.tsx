'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowUp, ArrowDown, Plus, Trash2, Play, Archive, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { notify } from '@/lib/toast';
import { cn } from '@/lib/cn';
import {
  useJourney,
  useUpdateJourney,
  useActivateJourney,
  useArchiveJourney,
  useJourneyEnrollments,
  useEnrollInJourney,
  JOURNEY_STEP_TYPES,
  type Journey,
  type JourneyStep,
  type JourneyStepType,
} from '@/hooks/use-command-center';

const STEP_HINTS: Record<JourneyStepType, string> = {
  WAIT: 'Pause the journey for a duration',
  ACTION: 'Run an internal action / webhook',
  EMAIL: 'Send an email',
  CONDITION: 'Branch on a field condition',
  BRANCH: 'Split into labelled branches',
  GOAL: 'Mark a conversion goal',
  EXIT: 'End the journey',
};

function genId() {
  return `step_${Math.random().toString(36).slice(2, 8)}`;
}

export default function JourneyEditorPage() {
  const params = useParams<{ journeyId: string }>();
  const journeyId = params.journeyId;

  const { data: journey, isLoading } = useJourney(journeyId);
  const updateJourney = useUpdateJourney(journeyId);
  const activate = useActivateJourney();
  const archive = useArchiveJourney();
  const { data: enrollments } = useJourneyEnrollments(journeyId);
  const enroll = useEnrollInJourney(journeyId);

  const [draft, setDraft] = useState<Journey | null>(null);
  const [entityId, setEntityId] = useState('');

  useEffect(() => {
    if (journey) setDraft(journey);
  }, [journey]);

  if (isLoading || !draft) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-64" />
      </main>
    );
  }

  const setEntryEvent = (event: string) =>
    setDraft({ ...draft, entryTrigger: { ...draft.entryTrigger, event } });

  const addStep = () =>
    setDraft({
      ...draft,
      steps: [...draft.steps, { id: genId(), type: 'ACTION', config: {}, nextStepId: null }],
    });

  const updateStep = (id: string, patch: Partial<JourneyStep>) =>
    setDraft({ ...draft, steps: draft.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const removeStep = (id: string) =>
    setDraft({ ...draft, steps: draft.steps.filter((s) => s.id !== id) });

  const moveStep = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= draft.steps.length) return;
    const steps = [...draft.steps];
    [steps[index], steps[next]] = [steps[next], steps[index]];
    setDraft({ ...draft, steps });
  };

  const save = async () => {
    try {
      await updateJourney.mutateAsync({
        name: draft.name,
        description: draft.description,
        entryTrigger: draft.entryTrigger,
        steps: draft.steps,
      });
      notify.success('Journey saved');
    } catch (err) {
      notify.error('Could not save journey', err instanceof Error ? err.message : undefined);
    }
  };

  const handleActivate = async () => {
    try {
      await activate.mutateAsync(journeyId);
      notify.success('Journey activated');
    } catch (err) {
      notify.error('Could not activate', err instanceof Error ? err.message : undefined);
    }
  };
  const handleArchive = async () => {
    try {
      await archive.mutateAsync(journeyId);
      notify.success('Journey archived');
    } catch (err) {
      notify.error('Could not archive', err instanceof Error ? err.message : undefined);
    }
  };
  const handleEnroll = async () => {
    if (!entityId.trim()) {
      notify.error('Entity ID is required');
      return;
    }
    try {
      await enroll.mutateAsync({ entityId: entityId.trim() });
      notify.success('Enrolled');
      setEntityId('');
    } catch (err) {
      notify.error('Could not enroll', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/command-center" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to journeys
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex-1">
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="max-w-md text-lg font-semibold" />
          <p className="mt-1 text-xs capitalize text-slate-500">Entity: {draft.entityType} · Status: {draft.status}</p>
        </div>
        <div className="flex items-center gap-2">
          {draft.status !== 'ACTIVE' && <Button variant="secondary" onClick={handleActivate}><Play className="h-4 w-4" /> Activate</Button>}
          {draft.status !== 'ARCHIVED' && <Button variant="secondary" onClick={handleArchive}><Archive className="h-4 w-4" /> Archive</Button>}
          <Button onClick={save} isLoading={updateJourney.isPending}><Save className="h-4 w-4" /> Save</Button>
        </div>
      </div>

      {/* Entry trigger */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Entry trigger</h2>
        <label className="mb-1 block text-sm font-medium text-slate-700">Event</label>
        <Input value={draft.entryTrigger.event ?? ''} onChange={(e) => setEntryEvent(e.target.value)} placeholder="deal.won" className="max-w-sm" />
        <p className="mt-1 text-xs text-slate-400">Records matching this event enter the journey.</p>
      </section>

      {/* Steps */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Steps ({draft.steps.length})</h2>
          <Button variant="secondary" size="sm" onClick={addStep}><Plus className="h-4 w-4" /> Add step</Button>
        </div>
        {draft.steps.length === 0 ? (
          <EmptyState icon="🔗" title="No steps yet" description="Add steps to define the journey flow." cta={{ label: 'Add step', onClick: addStep }} />
        ) : (
          <ol className="space-y-3">
            {draft.steps.map((step, i) => (
              <li key={step.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <span className="mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{i + 1}</span>
                    <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => moveStep(i, 1)} disabled={i === draft.steps.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={step.type} onChange={(e) => updateStep(step.id, { type: e.target.value as JourneyStepType })} className="w-40">
                        {JOURNEY_STEP_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </Select>
                      <span className="text-xs text-slate-400">{STEP_HINTS[step.type]}</span>
                      <button type="button" onClick={() => removeStep(step.id)} className="ml-auto rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove step"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <StepConfig step={step} onChange={(config) => updateStep(step.id, { config })} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Enrollments */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Enrollments</h2>
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Enroll entity ID</label>
            <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="contact_123" className="w-56" />
          </div>
          <Button variant="secondary" size="sm" onClick={handleEnroll} isLoading={enroll.isPending}>Enroll</Button>
        </div>
        {!enrollments || enrollments.length === 0 ? (
          <p className="text-sm text-slate-400">No enrollments yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {enrollments.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2">
                <span className="font-mono text-xs text-slate-700">{e.entityType}:{e.entityId}</span>
                <span className={cn(
                  'rounded px-1.5 py-0.5 text-xs',
                  e.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : e.status === 'EXITED' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                )}>{e.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/** Per-type step config editor — a small JSON-backed form per step type. */
function StepConfig({ step, onChange }: { step: JourneyStep; onChange: (config: Record<string, unknown>) => void }) {
  const set = (key: string, value: unknown) => onChange({ ...step.config, [key]: value });

  switch (step.type) {
    case 'WAIT':
      return (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-slate-500">Wait (hours)</label>
          <Input type="number" value={String(step.config.durationHours ?? '')} onChange={(e) => set('durationHours', Number(e.target.value))} className="w-32" />
        </div>
      );
    case 'EMAIL':
      return (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Template</label>
            <Input value={String(step.config.template ?? '')} onChange={(e) => set('template', e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Subject</label>
            <Input value={String(step.config.subject ?? '')} onChange={(e) => set('subject', e.target.value)} />
          </div>
        </div>
      );
    case 'CONDITION':
      return (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Field</label>
            <Input value={String(step.config.field ?? '')} onChange={(e) => set('field', e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Equals</label>
            <Input value={String(step.config.equals ?? '')} onChange={(e) => set('equals', e.target.value)} />
          </div>
        </div>
      );
    case 'GOAL':
      return (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-slate-500">Goal name</label>
          <Input value={String(step.config.name ?? '')} onChange={(e) => set('name', e.target.value)} className="max-w-xs" />
        </div>
      );
    case 'ACTION':
      return (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-slate-500">Action key</label>
          <Input value={String(step.config.action ?? '')} onChange={(e) => set('action', e.target.value)} placeholder="notify_owner" className="max-w-xs" />
        </div>
      );
    case 'BRANCH':
      return (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-slate-500">Branch labels (comma separated)</label>
          <Input
            value={Array.isArray(step.config.labels) ? (step.config.labels as string[]).join(', ') : ''}
            onChange={(e) => set('labels', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          />
        </div>
      );
    case 'EXIT':
    default:
      return null;
  }
}
