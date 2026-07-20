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
import { Button } from '@/components/ui/button';
import { ExportButton } from '@/components/export/ExportButton';
import {
  CRMEmptyState,
  CRMMetricCard,
  CRMMetricGrid,
  CRMModuleShell,
  CRMPageHeader,
  CRMSidePanel,
  CRMStatusBadge,
  CRMTableShell,
  CRMToolbar,
} from '@/components/ui/crm';
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

type BadgeTone = 'blue' | 'emerald' | 'amber' | 'orange' | 'rose' | 'slate';

const PRIORITY_TONES: Record<string, BadgeTone> = {
  HIGH: 'rose',
  NORMAL: 'amber',
  LOW: 'emerald',
};

const STATUS_TONES: Record<string, BadgeTone> = {
  TODO: 'blue',
  PLANNED: 'blue',
  IN_PROGRESS: 'amber',
  COMPLETED: 'emerald',
  DONE: 'emerald',
  CANCELLED: 'slate',
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
    <CRMModuleShell className="space-y-6">
      <CRMPageHeader
        eyebrow="Execution queue"
        icon={CheckSquare}
        title="Tasks"
        description="Manage follow-ups, ownership, priorities, and due dates efficiently."
        actions={
          <>
            <ExportButton module="tasks" />
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Task
            </Button>
          </>
        }
        metrics={
          <CRMMetricGrid>
            <CRMMetricCard icon={CheckSquare} label="Total Tasks" value={stats.total} tone="blue" />
            <CRMMetricCard icon={AlertCircle} label="High Priority" value={stats.high} tone="rose" />
            <CRMMetricCard icon={Clock} label="Overdue" value={stats.overdue} tone="amber" />
            <CRMMetricCard icon={CheckCircle2} label="Completed" value={stats.completed} tone="emerald" />
          </CRMMetricGrid>
        }
      />

      <CRMToolbar>
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tasks..."
            className="h-12 w-full rounded-lg border border-outline-variant bg-surface-container-high pl-10 pr-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:bg-surface focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
      </CRMToolbar>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <CRMTableShell>
            {tasksQuery.isLoading ? (
              <div className="space-y-3 p-4">
                {[...Array(5)].map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-lg bg-surface-container-high" />
                ))}
              </div>
            ) : filteredTasks.length === 0 ? (
              <CRMEmptyState
                icon={CheckSquare}
                title="No tasks found"
                description="Change filters or create a new task from the activity workflow."
              />
            ) : (
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-surface-container-low text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                  <tr>
                    <th className="w-2/5 p-4 text-left">Task Name</th>
                    <th className="p-4 text-left">Due Date</th>
                    <th className="p-4 text-left">Priority</th>
                    <th className="p-4 text-left">Assigned To</th>
                    <th className="p-4 text-left">Status</th>
                    <th className="p-4 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {filteredTasks.map((task) => (
                    <tr
                      key={task.id}
                      onClick={() => setSelectedId(task.id)}
                      className={cn(
                        'cursor-pointer transition hover:bg-surface-container-low',
                        selectedTask?.id === task.id && 'bg-primary-container/70'
                      )}
                    >
                      <td className={cn('p-4 font-semibold', selectedTask?.id === task.id ? 'text-primary' : 'text-on-surface')}>
                        {task.subject}
                        {isOverdue(task) ? (
                          <CRMStatusBadge tone="rose" className="ml-2 uppercase">
                            Overdue
                          </CRMStatusBadge>
                        ) : null}
                      </td>
                      <td className="p-4 text-on-surface-variant">{formatDate(task.dueDate)}</td>
                      <td className="p-4">
                        <CRMStatusBadge tone={PRIORITY_TONES[task.priority] ?? 'amber'} className="uppercase">
                          {task.priority}
                        </CRMStatusBadge>
                      </td>
                      <td className="p-4 text-on-surface-variant">{task.ownerId ? ownerMap.get(task.ownerId) ?? task.ownerId : 'Unassigned'}</td>
                      <td className="p-4">
                        <CRMStatusBadge tone={STATUS_TONES[task.status] ?? 'blue'} className="uppercase">
                          {task.status.replace('_', ' ')}
                        </CRMStatusBadge>
                      </td>
                      <td className="p-4">
                        {isCompleted(task) ? (
                          <span className="text-xs font-semibold text-on-surface-variant">Completed</span>
                        ) : (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleComplete(task);
                            }}
                            className="font-semibold text-primary hover:underline"
                          >
                            Complete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CRMTableShell>
        </section>

        <CRMSidePanel
          title="Selected task"
          description="Inspect and edit the task highlighted in the queue."
          className="xl:sticky xl:top-24 xl:self-start"
        >
          {selectedTask ? (
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void handleSave(); }}>
              <Field label="Task Name">
                <input className="form-input h-11 w-full rounded-lg border-outline-variant text-sm focus:border-primary focus:ring-primary/30" value={draft.subject} onChange={(event) => setDraft((prev) => ({ ...prev, subject: event.target.value }))} />
              </Field>
              <Field label="Description">
                <textarea className="form-textarea min-h-28 w-full resize-none rounded-lg border-outline-variant text-sm focus:border-primary focus:ring-primary/30" value={draft.description} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Field label="Due Date">
                  <input type="date" className="form-input h-11 w-full rounded-lg border-outline-variant text-sm focus:border-primary focus:ring-primary/30" value={draft.dueDate} onChange={(event) => setDraft((prev) => ({ ...prev, dueDate: event.target.value }))} />
                </Field>
                <Field label="Priority">
                  <select className="form-select h-11 w-full rounded-lg border-outline-variant text-sm focus:border-primary focus:ring-primary/30" value={draft.priority} onChange={(event) => setDraft((prev) => ({ ...prev, priority: event.target.value }))}>
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Field label="Assigned To">
                  <select className="form-select h-11 w-full rounded-lg border-outline-variant text-sm focus:border-primary focus:ring-primary/30" value={draft.ownerId} onChange={(event) => setDraft((prev) => ({ ...prev, ownerId: event.target.value }))}>
                    <option value="">Unassigned</option>
                    {(usersQuery.data?.data ?? []).map((user) => (
                      <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Status">
                  <select className="form-select h-11 w-full rounded-lg border-outline-variant text-sm focus:border-primary focus:ring-primary/30" value={draft.status} onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}>
                    <option value="TODO">Open</option>
                    <option value="PLANNED">Planned</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </Field>
              </div>

              <div>
                <p className="mb-1 text-sm font-medium text-on-surface">Associated Record</p>
                <div className="space-y-2 rounded-lg bg-surface-container-high p-3 text-sm">
                  <AssociatedLink href={selectedTask.leadId ? `/leads/${selectedTask.leadId}` : null} label="Lead" value={selectedTask.leadId} />
                  <AssociatedLink href={selectedTask.dealId ? `/deals/${selectedTask.dealId}` : null} label="Deal" value={selectedTask.dealId} />
                  <AssociatedLink href={selectedTask.contactId ? `/contacts/${selectedTask.contactId}` : null} label="Contact" value={selectedTask.contactId} />
                  <AssociatedLink href={selectedTask.accountId ? `/accounts/${selectedTask.accountId}` : null} label="Account" value={selectedTask.accountId} />
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3 text-sm text-on-surface-variant">
                <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Created {formatDate(selectedTask.createdAt)}</span>
                <span className="inline-flex items-center gap-2"><UserRound className="h-4 w-4 text-primary" /> Owner {selectedTask.ownerId ? ownerMap.get(selectedTask.ownerId) ?? selectedTask.ownerId : 'Unassigned'}</span>
                {isOverdue(selectedTask) ? <span className="inline-flex items-center gap-2 text-error"><AlertCircle className="h-4 w-4" /> This task is overdue</span> : null}
              </div>

              <div className="flex justify-end gap-3 border-t border-outline-variant pt-4">
                <button type="button" className="h-10 rounded-lg bg-surface-container-high px-4 text-sm font-bold text-on-surface" onClick={() => setSelectedId(filteredTasks[0]?.id ?? null)}>
                  Cancel
                </button>
                <Button type="submit" className="h-10 px-4 text-sm font-bold" isLoading={updateActivity.isPending}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
              </div>
            </form>
          ) : (
            <CRMEmptyState
              icon={Clock}
              title="No task selected"
              description="Select a task from the queue to inspect and edit it."
              className="rounded-lg border border-dashed border-outline-variant bg-surface-container-low"
            />
          )}
        </CRMSidePanel>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>Create a follow-up task with an owner and due date.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <Field label="Title">
              <input
                className="form-input h-11 w-full rounded-lg border-outline-variant text-sm focus:border-primary focus:ring-primary/30"
                value={createDraft.subject}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, subject: event.target.value }))}
                placeholder="Call back the prospect"
                required
              />
            </Field>
            <Field label="Description">
              <textarea
                className="form-textarea min-h-24 w-full resize-none rounded-lg border-outline-variant text-sm focus:border-primary focus:ring-primary/30"
                value={createDraft.description}
                onChange={(event) => setCreateDraft((prev) => ({ ...prev, description: event.target.value }))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Due Date">
                <input
                  type="date"
                  className="form-input h-11 w-full rounded-lg border-outline-variant text-sm focus:border-primary focus:ring-primary/30"
                  value={createDraft.dueDate}
                  onChange={(event) => setCreateDraft((prev) => ({ ...prev, dueDate: event.target.value }))}
                />
              </Field>
              <Field label="Priority">
                <select
                  className="form-select h-11 w-full rounded-lg border-outline-variant text-sm focus:border-primary focus:ring-primary/30"
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
                  className="form-select h-11 w-full rounded-lg border-outline-variant text-sm focus:border-primary focus:ring-primary/30"
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
                  className="form-input h-11 w-full rounded-lg border-outline-variant text-sm focus:border-primary focus:ring-primary/30"
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
              <Button type="submit" isLoading={createActivity.isPending}>
                Create task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </CRMModuleShell>
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
      <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
      <select
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-lg border border-outline-variant bg-surface pl-9 pr-8 text-sm font-medium text-on-surface outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/30"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{label}: {optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-on-surface">{label}</span>
      {children}
    </label>
  );
}

function AssociatedLink({ href, label, value }: { href: string | null; label: string; value: string | null }): ReactElement | null {
  if (!value) return null;
  return href ? (
    <Link href={href} className="flex items-center gap-2 font-medium text-primary hover:underline">
      <CheckSquare className="h-4 w-4" />
      {label}: {value}
    </Link>
  ) : (
    <span className="flex items-center gap-2 font-medium text-on-surface">
      <CheckSquare className="h-4 w-4 text-primary" />
      {label}: {value}
    </span>
  );
}
