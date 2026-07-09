'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { notify } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';
import {
  useCreateJourney,
  JOURNEY_ENTITY_TYPES,
  JOURNEY_STEP_TYPES,
  type JourneyEntityType,
  type JourneyStep,
  type JourneyStepType,
} from '@/hooks/use-command-center';

/**
 * Create journey — posts to the workflow-service CommandCenter create endpoint
 * (`POST /api/v1/command-center/journeys`) via `use-command-center`. Captures
 * name, entity type, entry trigger event, and a minimal ordered step list, then
 * redirects to the new journey's detail page.
 */

function genStepId() {
  return `step_${Math.random().toString(36).slice(2, 8)}`;
}

export default function NewJourneyPage() {
  const router = useRouter();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission('workflows:create') || hasPermission('workflows:read');
  const createJourney = useCreateJourney();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entityType, setEntityType] = useState<JourneyEntityType>('contact');
  const [entryEvent, setEntryEvent] = useState('');
  const [steps, setSteps] = useState<JourneyStep[]>([]);

  if (!canCreate) {
    return (
      <main className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You do not have permission to create journeys.
        </div>
      </main>
    );
  }

  const addStep = () =>
    setSteps((prev) => [...prev, { id: genStepId(), type: 'ACTION', config: {}, nextStepId: null }]);
  const updateStepType = (id: string, type: JourneyStepType) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, type } : s)));
  const removeStep = (id: string) => setSteps((prev) => prev.filter((s) => s.id !== id));

  const handleCreate = async () => {
    if (!name.trim()) {
      notify.error('Name is required');
      return;
    }
    try {
      const journey = await createJourney.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        entityType,
        entryTrigger: entryEvent.trim() ? { event: entryEvent.trim() } : {},
        steps,
      });
      notify.success('Journey created');
      if (journey?.id) {
        router.push(`/journeys/${journey.id}`);
      } else {
        router.push('/journeys');
      }
    } catch (err) {
      notify.error('Could not create journey', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/journeys" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to journeys
      </Link>

      <h1 className="mb-1 text-2xl font-bold text-slate-900">New Journey</h1>
      <p className="mb-6 text-sm text-slate-600">
        Define the record type, entry trigger, and an initial step flow. You can refine steps in the editor afterwards.
      </p>

      <div className="space-y-5">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New Customer Onboarding" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Entity type</label>
            <Select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value as JourneyEntityType)}
              className="capitalize"
            >
              {JOURNEY_ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Entry trigger event</label>
            <Input value={entryEvent} onChange={(e) => setEntryEvent(e.target.value)} placeholder="deal.won" />
            <p className="mt-1 text-xs text-slate-400">Optional — records matching this event enter the journey. Leave blank to enroll manually.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What this journey does" />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Steps ({steps.length})</h2>
            <Button variant="secondary" onClick={addStep} type="button">
              <Plus className="h-4 w-4" /> Add step
            </Button>
          </div>
          {steps.length === 0 ? (
            <p className="text-sm text-slate-400">No steps yet. Add a step to define the flow (optional at creation).</p>
          ) : (
            <ol className="space-y-2">
              {steps.map((step, i) => (
                <li key={step.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {i + 1}
                  </span>
                  <Select
                    value={step.type}
                    onChange={(e) => updateStepType(step.id, e.target.value as JourneyStepType)}
                    className="w-40"
                  >
                    {JOURNEY_STEP_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </Select>
                  <span className="font-mono text-[10px] text-slate-400">{step.id}</span>
                  <button
                    type="button"
                    onClick={() => removeStep(step.id)}
                    className="ml-auto rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove step"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="flex justify-end gap-2">
          <Link href="/journeys">
            <Button variant="secondary" type="button">Cancel</Button>
          </Link>
          <Button onClick={handleCreate} isLoading={createJourney.isPending} type="button">
            Create journey
          </Button>
        </div>
      </div>
    </main>
  );
}
