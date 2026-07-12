'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Circle, HelpCircle, ListChecks, X } from 'lucide-react';
import { useBff } from '@/lib/use-bff';

const DISMISS_KEY = 'nexus-setup-checklist-dismissed';

interface ProbeDef {
  id: string;
  label: string;
  href: string;
  endpoint: string;
}

// Each probe hits a read endpoint and is "done" when it returns ≥1 record.
const PROBES: ProbeDef[] = [
  { id: 'users', label: 'Invite your first user', href: '/settings/users', endpoint: '/bff/auth/users' },
  { id: 'roles', label: 'Define a role', href: '/settings/roles', endpoint: '/bff/auth/roles' },
  { id: 'pipeline', label: 'Set up a pipeline', href: '/settings/pipelines', endpoint: '/bff/crm/pipelines' },
  { id: 'custom-field', label: 'Add a custom field', href: '/settings/custom-fields', endpoint: '/bff/metadata/custom-fields' },
  { id: 'workflow', label: 'Create a workflow', href: '/settings/workflows', endpoint: '/bff/workflow/workflows' },
];

type ProbeState = 'loading' | 'done' | 'todo' | 'unknown';

/** True when a normalized BFF payload contains at least one record. */
function hasItems(data: unknown): boolean {
  if (Array.isArray(data)) return data.length > 0;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.data)) return (obj.data as unknown[]).length > 0;
    if (typeof obj.total === 'number') return obj.total > 0;
  }
  return false;
}

export function SetupChecklist() {
  const { get } = useBff();
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid a flash pre-hydration
  const [states, setStates] = useState<Record<string, ProbeState>>(
    Object.fromEntries(PROBES.map((p) => [p.id, 'loading']))
  );

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    PROBES.forEach(async (probe) => {
      const res = await get(probe.endpoint);
      if (cancelled) return;
      setStates((prev) => ({
        ...prev,
        // Only a successful response with ≥1 record is "done"; a successful but
        // empty response is "todo"; anything else (401/403/404/5xx/network)
        // degrades to "unknown" so a probe failure never blocks the card.
        [probe.id]: res.ok ? (hasItems(res.data) ? 'done' : 'todo') : 'unknown',
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [get]);

  if (dismissed) return null;

  const doneCount = PROBES.filter((p) => states[p.id] === 'done').length;
  const allDone = doneCount === PROBES.length;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface p-5" aria-label="Setup progress">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-primary-container p-2.5 text-on-primary-container">
            <ListChecks className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold text-on-surface">Get set up</h2>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              {allDone ? 'All core steps complete — nice work!' : `${doneCount} of ${PROBES.length} steps complete`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss setup checklist"
          className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-container-high">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${(doneCount / PROBES.length) * 100}%` }}
        />
      </div>

      <ul className="space-y-1">
        {PROBES.map((probe) => {
          const state = states[probe.id];
          const done = state === 'done';
          return (
            <li key={probe.id}>
              <Link
                href={probe.href}
                className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                ) : state === 'unknown' ? (
                  <HelpCircle className="h-4 w-4 shrink-0 text-outline" aria-hidden />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-outline" aria-hidden />
                )}
                <span className={`flex-1 ${done ? 'line-through opacity-60' : ''}`}>{probe.label}</span>
                {!done ? (
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
