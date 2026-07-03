'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock,
  Filter,
  Plus,
  Search,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useActivities, useCompleteActivity, useCreateActivity, useUpdateActivity } from '@/hooks/use-activities';
import { useUsers } from '@/hooks/use-users';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const RELATED_TO_FIELDS = [
  { value: 'dealId', label: 'Deal' },
  { value: 'contactId', label: 'Contact' },
  { value: 'leadId', label: 'Lead' },
  { value: 'accountId', label: 'Account' },
] as const;

type RelatedToField = (typeof RELATED_TO_FIELDS)[number]['value'];

const EMPTY_CREATE_DRAFT = {
  subject: '',
  description: '',
  dueDate: '',
  priority: 'NORMAL',
  status: 'TODO',
  relatedToField: 'dealId' as RelatedToField,
  relatedToId: '',
};

interface TaskItem {
  id: string;
  type: string;
  subject: string;
  status: string;
  priority: string;
  dueDate: string | null;
  ownerId: string | null;
  dealId: string | null;
  contactId: string | null;
  leadId: string | null;
  accountId: string | null;
  createdAt: string;
  description: string | null;
  outcome: string | null;
}

type StatusFilter = 'all' | 'open' | 'in-progress' | 'completed';
type PriorityFilter = 'all' | 'HIGH' | 'NORMAL' | 'LOW';
type DueFilter = 'all' | 'overdue' | 'today' | 'week';

const PRIORITY_STYLES: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700',
  NORMAL: 'bg-orange-100 text-orange-700',
  LOW: 'bg-emerald-100 text-emerald-700',
};

const STATUS_STYLES: Record<string, string> = {
  TODO: 'bg-blue-100 text-blue-700',
  PLANNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  DONE: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

function isCompleted(task: TaskItem): boolean {
  return task.status === 'COMPLETED' || task.status === 'DONE';
}

function isOverdue(task: TaskItem): boolean {
  if (!task.dueDate || isCompleted(task) || task.status === 'CANCELLED') return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

function formatDate(value: string | null): string {
  if (!value) return 'No due date';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function toDateInput(value: string | null): string {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

export default function TasksPage(): ReactElement {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState(EMPTY_CREATE_DRAFT);
  const [draft, setDraft] = useState({
    subject: '',
    description: '',
    dueDate: '',
    priority: 'NORMAL',
    ownerId: '',
    status: 'TODO',
  });

  const toast = useUiStore((s) => s.pushToast);
  const userId = useAuthStore((s) => s.userId);
  const tasksQuery = useActivities({ page: 1, limit: 75, type: 'TASK' });
  const usersQuery = useUsers();
  const completeActivity = useCompleteActivity();
  const updateActivity = useUpdateActivity();
  const createActivity = useCreateActivity();

  const ownerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of usersQuery.data?.data ?? []) {
      map.set(user.id, `${user.firstName} ${user.lastName}`);
    }
    return map;
  }, [usersQuery.data]);

  const tasks = useMemo(() => (tasksQuery.data?.data ?? []) as TaskItem[], [tasksQuery.data]);

  const filteredTasks = useMemo(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000;
    const endOfWeek = startOfToday + 7 * 24 * 60 * 60 * 1000;

    return tasks.filter((task) => {
      const haystack = `${task.subject} ${task.description ?? ''}`.toLowerCase();
      if (search && !haystack.includes(search.toLowerCase())) return false;
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
      if (statusFilter === 'open' && isCompleted(task)) return false;
      if (statusFilter === 'in-progress' && task.status !== 'IN_PROGRESS') return false;
      if (statusFilter === 'completed' && !isCompleted(task)) return false;

      const due = task.dueDate ? new Date(task.dueDate).getTime() : null;
      if (dueFilter === 'overdue' && !isOverdue(task)) return false;
      if (dueFilter === 'today' && (due === null || due < startOfToday || due >= endOfToday)) return false;
      if (dueFilter === 'week' && (due === null || due < startOfToday || due > endOfWeek)) return false;
      return true;
    });
  }, [dueFilter, priorityFilter, search, statusFilter, tasks]);

  const selectedTask = useMemo(
    () => filteredTasks.find((task) => task.id === selectedId) ?? filteredTasks[0] ?? null,
    [filteredTasks, selectedId]
  );

  useEffect(() => {
    if (!selectedTask) return;
    setSelectedId(selectedTask.id);
    setDraft({
      subject: selectedTask.subject,
      description: selectedTask.description ?? '',
      dueDate: toDateInput(selectedTask.dueDate),
      priority: selectedTask.priority,
      ownerId: selectedTask.ownerId ?? '',
      status: selectedTask.status,
    });
  }, [selectedTask]);

  const stats = useMemo(() => {
    const completed = tasks.filter(isCompleted).length;
    const overdue = tasks.filter(isOverdue).length;
    const high = tasks.filter((task) => task.priority === 'HIGH' && !isCompleted(task)).length;
    return { total: tasks.length, completed, overdue, high };
  }, [tasks]);

  async function handleComplete(task: TaskItem): Promise<void> {
    try {
      await completeActivity.mutateAsync({ id: task.id, outcome: 'Completed from tasks workbench' });
      toast({ variant: 'success', title: `"${task.subject}" completed` });
    } catch {
      toast({ variant: 'error', title: 'Failed to complete task' });
    }
  }

  function openCreate(): void {
    setCreateDraft({ ...EMPTY_CREATE_DRAFT, ownerId: userId ?? '' } as typeof EMPTY_CREATE_DRAFT);
    setCreateOpen(true);
  }

  async function handleCreate(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!createDraft.subject.trim()) {
      toast({ variant: 'error', title: 'Title is required' });
      return;
    }
    if (!userId) {
      toast({ variant: 'error', title: 'You must be signed in to create a task' });
      return;
    }
    if (!createDraft.relatedToId.trim()) {
      toast({ variant: 'error', title: 'A related record is required' });
      return;
    }
    try {
      await createActivity.mutateAsync({
        type: 'TASK',
        subject: createDraft.subject.trim(),
        description: createDraft.description.trim() || undefined,
        priority: createDraft.priority,
        ownerId: userId,
        dueDate: createDraft.dueDate ? new Date(createDraft.dueDate).toISOString() : undefined,
        [createDraft.relatedToField]: createDraft.relatedToId.trim(),
        customFields: {},
      } as never);
      toast({ variant: 'success', title: `"${createDraft.subject.trim()}" created` });
      setCreateOpen(false);
      setCreateDraft(EMPTY_CREATE_DRAFT);
    } catch {
      toast({ variant: 'error', title: 'Failed to create task' });
    }
  }

  async function handleSave(): Promise<void> {
    if (!selectedTask) return;
    try {
      await updateActivity.mutateAsync({
        id: selectedTask.id,
        data: {
          subject: draft.subject,
          description: draft.description || undefined,
          dueDate: draft.dueDate ? new Date(draft.dueDate).toISOString() : undefined,
          priority: draft.priority as never,
          status: draft.status as never,
        },
      });
      toast({ variant: 'success', title: 'Task updated' });
    } catch {
      toast({ variant: 'error', title: 'Failed to save task' });
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0 space-y-5">
        <div className="overflow-hidden rounded-lg border border-[#dbe7f3] bg-white shadow-sm">
          <div className="h-1.5 bg-gradient-to-r from-[#4A90E2] via-[#7ED321] to-amber-400" />
          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-blue-700">Execution queue</p>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Tasks</h1>
                <p className="mt-1 text-sm text-slate-500">Manage follow-ups, ownership, priorities, and due dates efficiently.</p>
              </div>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#4A90E2] px-4 text-sm font-bold text-white shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Add Task
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Total Tasks" value={String(stats.total)} tone="blue" />
              <Metric label="High Priority" value={String(stats.high)} tone="red" />
              <Metric label="Overdue" value={String(stats.overdue)} tone="amber" />
              <Metric label="Completed" value={String(stats.completed)} tone="green" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#e7edf3] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tasks..."
                className="h-12 w-full rounded-lg border border-slate-200 bg-slate-100 pl-10 pr-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <FilterSelect label="Status" value={statusFilter} onChange={(value) => setStatusFilter(value as StatusFilter)} options={[
              ['all', 'All'],
              ['open', 'Open'],
              ['in-progress', 'In Progress'],
              ['completed', 'Completed'],
            ]} />
            <FilterSelect label="Priority" value={priorityFilter} onChange={(value) => setPriorityFilter(value as PriorityFilter)} options={[
              ['all', 'All'],
              ['HIGH', 'High'],
              ['NORMAL', 'Medium'],
              ['LOW', 'Low'],
            ]} />
            <FilterSelect label="Due Date" value={dueFilter} onChange={(value) => setDueFilter(value as DueFilter)} options={[
              ['all', 'All'],
              ['overdue', 'Overdue'],
              ['today', 'Today'],
              ['week', 'Next 7 Days'],
            ]} />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#e7edf3] bg-white shadow-sm">
          {tasksQuery.isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(5)].map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : filteredTasks.length === 0 ? (
            <EmptyState icon="✓" title="No tasks found" description="Change filters or create a new task from the activity workflow." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="w-2/5 p-4 text-left">Task Name</th>
                    <th className="p-4 text-left">Due Date</th>
                    <th className="p-4 text-left">Priority</th>
                    <th className="p-4 text-left">Assigned To</th>
                    <th className="p-4 text-left">Status</th>
                    <th className="p-4 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTasks.map((task) => (
                    <tr
                      key={task.id}
                      onClick={() => setSelectedId(task.id)}
                      className={cn(
                        'cursor-pointer transition hover:bg-slate-50',
                        selectedTask?.id === task.id && 'bg-blue-50/70'
                      )}
                    >
                      <td className={cn('p-4 font-semibold', selectedTask?.id === task.id ? 'text-[#4A90E2]' : 'text-slate-900')}>
                        {task.subject}
                        {isOverdue(task) ? (
                          <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                            Overdue
                          </span>
                        ) : null}
                      </td>
                      <td className="p-4 text-slate-500">{formatDate(task.dueDate)}</td>
                      <td className="p-4">
                        <Badge className={PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.NORMAL}>{task.priority}</Badge>
                      </td>
                      <td className="p-4 text-slate-500">{task.ownerId ? ownerMap.get(task.ownerId) ?? task.ownerId : 'Unassigned'}</td>
                      <td className="p-4">
                        <Badge className={STATUS_STYLES[task.status] ?? STATUS_STYLES.TODO}>{task.status.replace('_', ' ')}</Badge>
                      </td>
                      <td className="p-4">
                        {isCompleted(task) ? (
                          <span className="text-xs font-semibold text-slate-400">Completed</span>
                        ) : (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleComplete(task);
                            }}
                            className="font-semibold text-[#4A90E2] hover:underline"
                          >
                            Complete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <aside className="rounded-xl border border-[#e7edf3] bg-white p-5 shadow-sm xl:sticky xl:top-24 xl:self-start">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-blue-700">Task details</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Selected task</h2>
          </div>
          <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
            <CheckSquare className="h-5 w-5" />
          </div>
        </div>

        {selectedTask ? (
          <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void handleSave(); }}>
            <Field label="Task Name">
              <input className="form-input h-11 w-full rounded-lg border-slate-200 text-sm focus:border-blue-400 focus:ring-blue-100" value={draft.subject} onChange={(event) => setDraft((prev) => ({ ...prev, subject: event.target.value }))} />
            </Field>
            <Field label="Description">
              <textarea className="form-textarea min-h-28 w-full resize-none rounded-lg border-slate-200 text-sm focus:border-blue-400 focus:ring-blue-100" value={draft.description} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field label="Due Date">
                <input type="date" className="form-input h-11 w-full rounded-lg border-slate-200 text-sm focus:border-blue-400 focus:ring-blue-100" value={draft.dueDate} onChange={(event) => setDraft((prev) => ({ ...prev, dueDate: event.target.value }))} />
              </Field>
              <Field label="Priority">
                <select className="form-select h-11 w-full rounded-lg border-slate-200 text-sm focus:border-blue-400 focus:ring-blue-100" value={draft.priority} onChange={(event) => setDraft((prev) => ({ ...prev, priority: event.target.value }))}>
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Field label="Assigned To">
                <select className="form-select h-11 w-full rounded-lg border-slate-200 text-sm focus:border-blue-400 focus:ring-blue-100" value={draft.ownerId} onChange={(event) => setDraft((prev) => ({ ...prev, ownerId: event.target.value }))}>
                  <option value="">Unassigned</option>
                  {(usersQuery.data?.data ?? []).map((user) => (
                    <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select className="form-select h-11 w-full rounded-lg border-slate-200 text-sm focus:border-blue-400 focus:ring-blue-100" value={draft.status} onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}>
                  <option value="TODO">Open</option>
                  <option value="PLANNED">Planned</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </Field>
            </div>

            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Associated Record</p>
              <div className="space-y-2 rounded-lg bg-slate-100 p-3 text-sm">
                <AssociatedLink href={selectedTask.leadId ? `/leads/${selectedTask.leadId}` : null} label="Lead" value={selectedTask.leadId} />
                <AssociatedLink href={selectedTask.dealId ? `/deals/${selectedTask.dealId}` : null} label="Deal" value={selectedTask.dealId} />
                <AssociatedLink href={selectedTask.contactId ? `/contacts/${selectedTask.contactId}` : null} label="Contact" value={selectedTask.contactId} />
                <AssociatedLink href={selectedTask.accountId ? `/accounts/${selectedTask.accountId}` : null} label="Account" value={selectedTask.accountId} />
              </div>
            </div>

            <div className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
              <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-blue-600" /> Created {formatDate(selectedTask.createdAt)}</span>
              <span className="inline-flex items-center gap-2"><UserRound className="h-4 w-4 text-blue-600" /> Owner {selectedTask.ownerId ? ownerMap.get(selectedTask.ownerId) ?? selectedTask.ownerId : 'Unassigned'}</span>
              {isOverdue(selectedTask) ? <span className="inline-flex items-center gap-2 text-red-600"><AlertCircle className="h-4 w-4" /> This task is overdue</span> : null}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button type="button" className="h-10 rounded-lg bg-slate-100 px-4 text-sm font-bold text-slate-700" onClick={() => setSelectedId(filteredTasks[0]?.id ?? null)}>
                Cancel
              </button>
              <Button type="submit" className="h-10 bg-[#7ED321] px-4 text-sm font-bold text-white hover:bg-[#70bd1d]" isLoading={updateActivity.isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-8 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <Clock className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">No task selected</p>
            <p className="mt-1 text-sm text-slate-500">Select a task from the queue to inspect and edit it.</p>
          </div>
        )}
      </aside>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>Create a follow-up task with an owner and due date.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <Field label="Title">
              <input
                className="form-input h-11 w-full rounded-lg border-slate-200 text-sm focus:border-blue-400 focus:ring-blue-100"
                value={createDraft.subject}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, subject: event.target.value }))}
                placeholder="Call back the prospect"
                required
              />
            </Field>
            <Field label="Description">
              <textarea
                className="form-textarea min-h-24 w-full resize-none rounded-lg border-slate-200 text-sm focus:border-blue-400 focus:ring-blue-100"
                value={createDraft.description}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, description: event.target.value }))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Due Date">
                <input
                  type="date"
                  className="form-input h-11 w-full rounded-lg border-slate-200 text-sm focus:border-blue-400 focus:ring-blue-100"
                  value={createDraft.dueDate}
                  onChange={(event) => setCreateDraft((prev) => ({ ...prev, dueDate: event.target.value }))}
                />
              </Field>
              <Field label="Priority">
                <select
                  className="form-select h-11 w-full rounded-lg border-slate-200 text-sm focus:border-blue-400 focus:ring-blue-100"
                  value={createDraft.priority}
                  onChange={(event) => setCreateDraft((prev) => ({ ...prev, priority: event.target.value }))}
                >
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Related To">
                <select
                  className="form-select h-11 w-full rounded-lg border-slate-200 text-sm focus:border-blue-400 focus:ring-blue-100"
                  value={createDraft.relatedToField}
                  onChange={(event) => setCreateDraft((prev) => ({ ...prev, relatedToField: event.target.value as RelatedToField }))}
                >
                  {RELATED_TO_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Record ID">
                <input
                  className="form-input h-11 w-full rounded-lg border-slate-200 text-sm focus:border-blue-400 focus:ring-blue-100"
                  value={createDraft.relatedToId}
                  onChange={(event) => setCreateDraft((prev) => ({ ...prev, relatedToId: event.target.value }))}
                  placeholder="Paste the record ID"
                  required
                />
              </Field>
            </div>
            <DialogFooter className="mt-2">
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-[#7ED321] text-white hover:bg-[#70bd1d]" isLoading={createActivity.isPending}>
                Create task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'red' | 'amber' | 'green' }): ReactElement {
  const styles = {
    blue: 'from-blue-500 to-cyan-400 text-blue-700',
    red: 'from-red-500 to-pink-400 text-red-700',
    amber: 'from-amber-500 to-orange-400 text-amber-700',
    green: 'from-emerald-500 to-lime-400 text-emerald-700',
  }[tone];
  return (
    <div className="overflow-hidden rounded-lg border border-[#e7edf3] bg-[#f9f9ff]">
      <div className={cn('h-1.5 bg-gradient-to-r', styles.split(' ').slice(0, 2).join(' '))} />
      <div className="p-4">
        <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
        <p className={cn('mt-2 text-2xl font-bold', styles.split(' ')[2])}>{value}</p>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}): ReactElement {
  return (
    <label className="relative min-w-[160px]">
      <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm font-medium text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{label}: {optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }): ReactElement {
  return <span className={cn('rounded-full px-2 py-1 text-xs font-bold uppercase', className)}>{children}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function AssociatedLink({ href, label, value }: { href: string | null; label: string; value: string | null }): ReactElement | null {
  if (!value) return null;
  return href ? (
    <Link href={href} className="flex items-center gap-2 font-medium text-[#4A90E2] hover:underline">
      <CheckSquare className="h-4 w-4" />
      {label}: {value}
    </Link>
  ) : (
    <span className="flex items-center gap-2 font-medium text-slate-700">
      <CheckSquare className="h-4 w-4 text-[#4A90E2]" />
      {label}: {value}
    </span>
  );
}
