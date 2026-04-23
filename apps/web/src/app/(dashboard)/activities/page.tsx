'use client';

import { useMemo, useState, type ReactElement } from 'react';
import type {
  Activity,
  ActivityPriorityLiteral,
  ActivityTypeLiteral,
} from '@nexus/shared-types';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import {
  useActivities,
  useCompleteActivity,
  useCreateActivity,
  useDeleteActivity,
  type ActivityListFilters,
} from '@/hooks/use-activities';
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  MailIcon,
  PhoneIcon,
  PlusIcon,
  VideoIcon,
  XIcon,
} from '@/components/ui/icons';

/**
 * Unified activities feed — Section 39.1. Tabs narrow by time / ownership,
 * slide-over form creates new activities, and per-row buttons complete or
 * delete activities inline.
 */

type TabId = 'all' | 'mine' | 'overdue' | 'upcoming';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'My Activities' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'upcoming', label: 'Upcoming' },
];

const TYPE_ICON: Record<string, (p: { size?: number }) => ReactElement> = {
  CALL: PhoneIcon,
  EMAIL: MailIcon,
  MEETING: VideoIcon,
  DEMO: VideoIcon,
  TASK: FileTextIcon,
  LUNCH: ClockIcon,
  FOLLOW_UP: ClockIcon,
  CONFERENCE: CalendarIcon,
  PROPOSAL: FileTextIcon,
  NEGOTIATION: FileTextIcon,
  NOTE: FileTextIcon,
};

function priorityBadge(priority: ActivityPriorityLiteral): string {
  switch (priority) {
    case 'URGENT':
      return 'bg-red-100 text-red-700';
    case 'HIGH':
      return 'bg-amber-100 text-amber-700';
    case 'NORMAL':
      return 'bg-sky-100 text-sky-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function filtersForTab(tab: TabId, userId: string | null): ActivityListFilters {
  const base: ActivityListFilters = { limit: 100 };
  if (tab === 'mine' && userId) return { ...base, ownerId: userId };
  if (tab === 'overdue') return { ...base, overdue: true };
  if (tab === 'upcoming') {
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return {
      ...base,
      status: 'PLANNED',
      dueAfter: now.toISOString(),
      dueBefore: in7.toISOString(),
    };
  }
  return base;
}

interface NewActivityState {
  type: ActivityTypeLiteral;
  subject: string;
  description: string;
  priority: ActivityPriorityLiteral;
  dueDate: string;
  dealId: string;
  contactId: string;
  leadId: string;
}

const INITIAL_NEW: NewActivityState = {
  type: 'TASK',
  subject: '',
  description: '',
  priority: 'NORMAL',
  dueDate: '',
  dealId: '',
  contactId: '',
  leadId: '',
};

export default function ActivitiesPage(): ReactElement {
  const userId = useAuthStore((s) => s.userId);
  const pushToast = useUiStore((s) => s.pushToast);
  const [tab, setTab] = useState<TabId>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<Activity | null>(null);
  const [outcome, setOutcome] = useState('');
  const [form, setForm] = useState<NewActivityState>(INITIAL_NEW);

  const filters = useMemo(() => filtersForTab(tab, userId), [tab, userId]);
  const { data, isLoading, isError, error } = useActivities(filters);
  const createActivity = useCreateActivity();
  const completeActivity = useCompleteActivity();
  const deleteActivity = useDeleteActivity();

  const rows = data?.data ?? [];
  const now = Date.now();

  function onCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.subject.trim()) {
      pushToast({ variant: 'warning', title: 'Subject is required' });
      return;
    }
    createActivity.mutate(
      {
        type: form.type,
        subject: form.subject.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        ownerId: userId ?? '',
        dealId: form.dealId.trim() || undefined,
        contactId: form.contactId.trim() || undefined,
        leadId: form.leadId.trim() || undefined,
        customFields: {},
      },
      {
        onSuccess: () => {
          pushToast({ variant: 'success', title: 'Activity scheduled' });
          setDrawerOpen(false);
          setForm(INITIAL_NEW);
        },
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Could not schedule',
            description: err.message,
          }),
      }
    );
  }

  function onCompleteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!completeTarget) return;
    completeActivity.mutate(
      { id: completeTarget.id, outcome: outcome.trim() || 'Completed' },
      {
        onSuccess: () => {
          pushToast({ variant: 'success', title: 'Activity completed' });
          setCompleteTarget(null);
          setOutcome('');
        },
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Could not complete',
            description: err.message,
          }),
      }
    );
  }

  function onDelete(a: Activity) {
    if (!confirm(`Cancel activity "${a.subject}"?`)) return;
    deleteActivity.mutate(a.id, {
      onError: (err) =>
        pushToast({
          variant: 'error',
          title: 'Could not cancel',
          description: err.message,
        }),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Activities</h1>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          <PlusIcon size={14} /> Schedule Activity
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === t.id
                ? 'border-slate-900 font-semibold text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Loading activities…
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Nothing here. Schedule your next touch-point.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Subject</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Due Date</th>
                <th className="px-4 py-2">Priority</th>
                <th className="px-4 py-2">Related To</th>
                <th className="px-4 py-2">Owner</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((a) => {
                const Icon = TYPE_ICON[a.type] ?? FileTextIcon;
                const due = a.dueDate ? new Date(a.dueDate).getTime() : null;
                const isOverdue =
                  due !== null &&
                  due < now &&
                  a.status !== 'COMPLETED' &&
                  a.status !== 'CANCELLED' &&
                  a.status !== 'DEFERRED';
                const related =
                  a.dealId || a.contactId || a.leadId || a.accountId;
                return (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-900">
                      {a.subject}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <Icon size={14} /> {a.type}
                      </span>
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2',
                        isOverdue ? 'font-semibold text-red-600' : 'text-slate-600'
                      )}
                    >
                      {formatDateTime(a.dueDate)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px]',
                          priorityBadge(a.priority)
                        )}
                      >
                        {a.priority}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px] text-slate-500">
                      {related ? related.slice(0, 10) : '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {a.ownerId.slice(0, 6)}
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {a.status !== 'COMPLETED' &&
                      a.status !== 'CANCELLED' &&
                      a.status !== 'DEFERRED' ? (
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => setCompleteTarget(a)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            <CheckIcon size={12} /> Complete
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(a)}
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setDrawerOpen(false)}
            className="flex-1 bg-slate-900/50"
          />
          <form
            onSubmit={onCreateSubmit}
            className="flex w-full max-w-md flex-col bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="text-lg font-semibold">Schedule Activity</h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <XIcon size={16} />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Type</span>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value as ActivityTypeLiteral })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5"
                >
                  {Object.keys(TYPE_ICON).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Subject *</span>
                <input
                  required
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  Description
                </span>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5"
                  rows={3}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">
                    Priority
                  </span>
                  <select
                    value={form.priority}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        priority: e.target.value as ActivityPriorityLiteral,
                      })
                    }
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5"
                  >
                    <option>LOW</option>
                    <option>NORMAL</option>
                    <option>HIGH</option>
                    <option>URGENT</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Due</span>
                  <input
                    type="datetime-local"
                    value={form.dueDate}
                    onChange={(e) =>
                      setForm({ ...form, dueDate: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5"
                  />
                </label>
              </div>
              <fieldset className="rounded-md border border-slate-200 p-3">
                <legend className="px-1 text-xs font-medium text-slate-600">
                  Related to (optional — at least one for context)
                </legend>
                <label className="mt-1 block">
                  <span className="text-xs text-slate-500">Deal ID</span>
                  <input
                    value={form.dealId}
                    onChange={(e) => setForm({ ...form, dealId: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs"
                  />
                </label>
                <label className="mt-2 block">
                  <span className="text-xs text-slate-500">Contact ID</span>
                  <input
                    value={form.contactId}
                    onChange={(e) =>
                      setForm({ ...form, contactId: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs"
                  />
                </label>
                <label className="mt-2 block">
                  <span className="text-xs text-slate-500">Lead ID</span>
                  <input
                    value={form.leadId}
                    onChange={(e) => setForm({ ...form, leadId: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs"
                  />
                </label>
              </fieldset>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 p-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createActivity.isPending}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {createActivity.isPending ? 'Scheduling…' : 'Schedule'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {completeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={onCompleteSubmit}
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold">Complete activity</h2>
            <p className="mt-1 text-sm text-slate-600">{completeTarget.subject}</p>
            <label className="mt-4 block text-sm">
              <span className="text-xs font-medium text-slate-600">Outcome</span>
              <textarea
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                rows={3}
                placeholder="What happened?"
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCompleteTarget(null)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={completeActivity.isPending}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {completeActivity.isPending ? 'Saving…' : 'Mark complete'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
