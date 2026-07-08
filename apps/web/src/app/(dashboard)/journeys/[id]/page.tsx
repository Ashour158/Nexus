'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Play, Archive, Trash2, Pencil, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/hooks/use-confirm';
import { notify } from '@/lib/toast';
import { cn } from '@/lib/cn';
import {
  useJourney,
  useJourneyEnrollments,
  useActivateJourney,
  useArchiveJourney,
  useDeleteJourney,
  useEnrollInJourney,
  type JourneyEnrollment,
  type JourneyStatus,
  type JourneyStep,
} from '@/hooks/use-command-center';

/**
 * Journey detail — read-focused view of a command-journey: header + lifecycle
 * actions, its ordered step definition, and an enrollments tab. Wired to the
 * workflow-service CommandCenter contract via `use-command-center`.
 */

const STATUS_STYLES: Record<JourneyStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  ARCHIVED: 'bg-amber-100 text-amber-800',
};

const STEP_STYLES: Record<string, string> = {
  WAIT: 'bg-slate-100 text-slate-700 border-slate-300',
  ACTION: 'bg-blue-100 text-blue-700 border-blue-300',
  EMAIL: 'bg-purple-100 text-purple-700 border-purple-300',
  CONDITION: 'bg-amber-100 text-amber-700 border-amber-300',
  BRANCH: 'bg-lime-100 text-lime-700 border-lime-300',
  GOAL: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  EXIT: 'bg-red-100 text-red-700 border-red-300',
};

function toArray<T>(v: T[] | undefined): T[] {
  if (Array.isArray(v)) return v;
  const o = v as unknown as { items?: T[]; data?: T[] } | undefined;
  return o?.items ?? o?.data ?? [];
}

function fmtDate(v: unknown): string {
  if (!v || typeof v !== 'string') return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function summarizeConfig(config: Record<string, unknown> | undefined): string {
  if (!config) return '';
  const entries = Object.entries(config).filter(([, val]) => val !== undefined && val !== '');
  if (entries.length === 0) return '';
  return entries.map(([k, val]) => `${k}: ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`).join(' · ');
}

export default function JourneyDetailPage() {
  const params = useParams<{ id: string }>();
  const journeyId = params.id;
  const router = useRouter();
  const { confirm, ConfirmDialog } = useConfirm();

  const { data: journey, isLoading, isError } = useJourney(journeyId);
  const enrollmentsQuery = useJourneyEnrollments(journeyId);
  const activate = useActivateJourney();
  const archive = useArchiveJourney();
  const remove = useDeleteJourney();
  const enroll = useEnrollInJourney(journeyId);

  const [tab, setTab] = useState<'overview' | 'enrollments'>('overview');
  const [entityId, setEntityId] = useState('');

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-4 h-64" />
      </main>
    );
  }

  if (isError || !journey) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Link href="/journeys" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to journeys
        </Link>
        <EmptyState
          icon="🚫"
          title="Journey not found"
          description="This journey may have been deleted, or the workflow service is unavailable."
          cta={{ label: 'Back to journeys', href: '/journeys' }}
        />
      </main>
    );
  }

  const steps = journey.steps ?? [];
  const enrollments = toArray<JourneyEnrollment>(enrollmentsQuery.data);

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
  const handleDelete = async () => {
    if (!(await confirm(`Delete "${journey.name}" and its enrollments? This cannot be undone.`, 'Delete journey?'))) return;
    try {
      await remove.mutateAsync(journeyId);
      notify.success('Journey deleted');
      router.push('/journeys');
    } catch (err) {
      notify.error('Could not delete', err instanceof Error ? err.message : undefined);
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
      <Link href="/journeys" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to journeys
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{journey.name}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[journey.status] ?? 'bg-slate-100 text-slate-700'}`}>
              {journey.status}
            </span>
          </div>
          {journey.description && <p className="mt-1 text-sm text-slate-600">{journey.description}</p>}
          <p className="mt-1 text-xs capitalize text-slate-500">Entity: {journey.entityType}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {journey.status !== 'ACTIVE' && (
            <Button variant="secondary" onClick={handleActivate} isLoading={activate.isPending}>
              <Play className="h-4 w-4" /> Activate
            </Button>
          )}
          {journey.status !== 'ARCHIVED' && (
            <Button variant="secondary" onClick={handleArchive} isLoading={archive.isPending}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
          )}
          <Link href={`/command-center/${journey.id}`}>
            <Button variant="secondary">
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </Link>
          <Button variant="destructive" onClick={handleDelete} isLoading={remove.isPending}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(['overview', 'enrollments'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors',
              tab === t
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {t}
            {t === 'enrollments' && enrollments.length > 0 && (
              <span className="ms-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {enrollments.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="space-y-6">
          {/* Entry trigger */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Entry trigger</h2>
            {journey.entryTrigger?.event ? (
              <p className="text-sm text-slate-700">
                Event <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{journey.entryTrigger.event}</code>
              </p>
            ) : (
              <p className="text-sm text-slate-400">No entry event configured — records are enrolled manually.</p>
            )}
          </section>

          {/* Steps (read-only) */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Steps ({steps.length})
            </h2>
            {steps.length === 0 ? (
              <EmptyState
                icon="🔗"
                title="No steps defined"
                description="Open the editor to add steps to this journey."
                cta={{ label: 'Edit journey', href: `/command-center/${journey.id}` }}
                compact
              />
            ) : (
              <ol className="space-y-3">
                {steps.map((step: JourneyStep, i) => (
                  <li key={step.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className={cn('inline-block rounded border px-2 py-0.5 text-xs font-semibold', STEP_STYLES[step.type] ?? 'bg-slate-100 text-slate-700 border-slate-300')}>
                          {step.type}
                        </span>
                        {summarizeConfig(step.config) && (
                          <p className="mt-1.5 truncate text-xs text-slate-500">{summarizeConfig(step.config)}</p>
                        )}
                        <p className="mt-1 font-mono text-[10px] text-slate-400">{step.id}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          {/* Manual enroll */}
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Enroll {journey.entityType} ID</label>
              <Input
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder={`${journey.entityType}_123`}
                className="w-56"
              />
            </div>
            <Button variant="secondary" onClick={handleEnroll} isLoading={enroll.isPending}>
              Enroll
            </Button>
          </div>

          {enrollmentsQuery.isLoading ? (
            <Skeleton className="h-24" />
          ) : enrollments.length === 0 ? (
            <p className="text-sm text-slate-400">No enrollments yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-start">Record</th>
                    <th className="px-3 py-2 text-start">Current step</th>
                    <th className="px-3 py-2 text-start">Status</th>
                    <th className="px-3 py-2 text-start">Enrolled</th>
                    <th className="px-3 py-2 text-start">Resume at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enrollments.map((e) => {
                    const raw = e as unknown as { enrolledAt?: string; enteredAt?: string; resumeAt?: string };
                    return (
                      <tr key={e.id}>
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">
                          {e.entityType}:{e.entityId}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-500">{e.currentStepId ?? '—'}</td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 text-xs font-medium',
                              e.status === 'ACTIVE'
                                ? 'bg-emerald-100 text-emerald-700'
                                : e.status === 'EXITED'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                            )}
                          >
                            {e.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(raw.enrolledAt ?? raw.enteredAt)}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {raw.resumeAt ? (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {fmtDate(raw.resumeAt)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {ConfirmDialog}
    </main>
  );
}
