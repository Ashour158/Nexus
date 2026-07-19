'use client';

import { useMemo, useState } from 'react';
import { Calendar, CalendarDays, CheckCircle2, FileText, List, Mail, MessageSquare, Phone, Clock, AlertCircle, Plus } from 'lucide-react';
import { ActivityCalendar } from '@/components/activities/ActivityCalendar';
import {
  CRMEmptyState,
  CRMErrorState,
  CRMFilterPills,
  CRMMetricCard,
  CRMMetricGrid,
  CRMModuleShell,
  CRMPageHeader,
  CRMSegmentedControl,
  CRMStatusBadge,
  CRMToolbar,
} from '@/components/ui/crm';
import { SavedViewsControl } from '@/components/crm/SavedViewsControl';
import { ExportButton } from '@/components/export/ExportButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/auth.store';
import { useActivities, useCompleteActivity, useCreateActivity } from '@/hooks/use-activities';
import { useUiStore } from '@/stores/ui.store';
import Link from 'next/link';

const RELATED_TO_FIELDS = [
  { value: 'dealId', label: 'Deal' },
  { value: 'contactId', label: 'Contact' },
  { value: 'leadId', label: 'Lead' },
  { value: 'accountId', label: 'Account' },
] as const;

type RelatedToField = (typeof RELATED_TO_FIELDS)[number]['value'];

const EMPTY_DRAFT = {
  type: 'CALL',
  subject: '',
  priority: 'NORMAL',
  dueDate: '',
  relatedToField: 'dealId' as RelatedToField,
  relatedToId: '',
};

type ActivityTab = 'all' | 'mine' | 'overdue' | 'upcoming';

interface ActivityItem {
  id: string;
  type: string;
  subject: string;
  status: string;
  priority: string;
  dueDate: string | null;
  startDate: string | null;
  endDate: string | null;
  ownerId: string | null;
  dealId: string | null;
  contactId: string | null;
  leadId: string | null;
  accountId: string | null;
  createdAt: string;
  description: string | null;
  outcome: string | null;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  CALL: <Phone className="h-4 w-4 text-success" />,
  EMAIL: <Mail className="h-4 w-4 text-primary" />,
  MEETING: <Calendar className="h-4 w-4 text-tertiary" />,
  NOTE: <FileText className="h-4 w-4 text-on-surface-variant" />,
  TASK: <MessageSquare className="h-4 w-4 text-warning" />,
};

const TYPE_LABELS: Record<string, string> = {
  CALL: 'Call',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  NOTE: 'Note',
  TASK: 'Task',
};

type BadgeTone = 'blue' | 'emerald' | 'amber' | 'orange' | 'rose' | 'slate';

const PRIORITY_TONES: Record<string, BadgeTone> = {
  URGENT: 'rose',
  HIGH: 'rose',
  NORMAL: 'blue',
  LOW: 'slate',
};

const STATUS_TONES: Record<string, BadgeTone> = {
  TODO: 'slate',
  IN_PROGRESS: 'amber',
  DONE: 'emerald',
  CANCELLED: 'slate',
};

function isOverdue(activity: ActivityItem): boolean {
  if (!activity.dueDate || activity.status === 'DONE' || activity.status === 'CANCELLED') return false;
  return new Date(activity.dueDate) < new Date();
}

export default function ActivitiesPage() {
  const [tab, setTab] = useState<ActivityTab>('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const toast = useUiStore((s) => s.pushToast);
  const userId = useAuthStore((s) => s.userId);

  const filters = useMemo(() => {
    const base: Record<string, unknown> = { page: 1, limit: 50 };
    if (tab === 'mine') base.ownerId = userId;
    if (tab === 'overdue') base.overdue = true;
    if (tab === 'upcoming') {
      base.dueAfter = new Date().toISOString();
      const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      base.dueBefore = sevenDays.toISOString();
    }
    return base;
  }, [tab, userId]);

  const activitiesQuery = useActivities(filters);
  // Calendar view needs a broader, unfiltered window to place items across the
  // month; it shares the activities cache and only matters when calendar is on.
  const calendarQuery = useActivities({ page: 1, limit: 100 });
  const completeActivity = useCompleteActivity();
  const createActivity = useCreateActivity();

  const activities = useMemo(() => (activitiesQuery.data?.data ?? []) as ActivityItem[], [activitiesQuery.data]);
  const calendarActivities = useMemo(
    () => (calendarQuery.data?.data ?? []) as ActivityItem[],
    [calendarQuery.data]
  );

  const stats = useMemo(
    () => ({
      shown: activities.length,
      overdue: activities.filter((a) => isOverdue(a)).length,
      done: activities.filter((a) => a.status === 'DONE').length,
      open: activities.filter((a) => a.status !== 'DONE' && a.status !== 'CANCELLED').length,
    }),
    [activities]
  );

  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.subject.trim()) {
      toast({ variant: 'error', title: 'Subject is required' });
      return;
    }
    if (!userId) {
      toast({ variant: 'error', title: 'You must be signed in to create an activity' });
      return;
    }
    if (!draft.relatedToId.trim()) {
      toast({ variant: 'error', title: 'A related record is required' });
      return;
    }
    try {
      await createActivity.mutateAsync({
        type: draft.type,
        subject: draft.subject.trim(),
        priority: draft.priority,
        ownerId: userId,
        dueDate: draft.dueDate ? new Date(draft.dueDate).toISOString() : undefined,
        [draft.relatedToField]: draft.relatedToId.trim(),
        customFields: {},
      } as never);
      toast({ variant: 'success', title: `"${draft.subject.trim()}" created` });
      setCreateOpen(false);
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      toast({ variant: 'error', title: 'Failed to create activity' });
    }
  };

  const handleComplete = async (id: string, subject: string) => {
    try {
      await completeActivity.mutateAsync({ id, outcome: 'Completed from activities page' });
      toast({ variant: 'success', title: `"${subject}" marked as done` });
    } catch (e) {
      toast({ variant: 'error', title: 'Failed to complete activity' });
    }
  };

  const tabs: { value: ActivityTab; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'mine', label: 'My Activities' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'upcoming', label: 'Upcoming (7d)' },
  ];

  return (
    <CRMModuleShell className="mx-auto max-w-5xl space-y-6">
      <CRMPageHeader
        eyebrow="Engagement"
        icon={CalendarDays}
        title="Activity Feed"
        description="Calls, emails, meetings, and tasks across your records — with what is overdue surfaced first."
        actions={
          <>
            <ExportButton module="activities" />
            <SavedViewsControl
              entityType="activity"
              currentFilters={{ tab }}
              onApply={(f) => setTab((f.tab as ActivityTab) ?? 'all')}
            />
            <Button onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              New activity
            </Button>
          </>
        }
        metrics={
          <CRMMetricGrid>
            <CRMMetricCard icon={FileText} label="In view" value={stats.shown} note="current filter" />
            <CRMMetricCard icon={Clock} label="Open" value={stats.open} note="not yet closed" tone="blue" />
            <CRMMetricCard icon={AlertCircle} label="Overdue" value={stats.overdue} note="past due date" tone="rose" />
            <CRMMetricCard icon={CheckCircle2} label="Completed" value={stats.done} note="marked done" tone="emerald" />
          </CRMMetricGrid>
        }
      />

      <CRMToolbar>
        <CRMSegmentedControl
          value={view}
          onChange={setView}
          options={[
            { value: 'list' as const, label: 'List', icon: List },
            { value: 'calendar' as const, label: 'Calendar', icon: CalendarDays },
          ]}
        />
        {view === 'list' ? <CRMFilterPills value={tab} options={tabs} onChange={setTab} /> : null}
      </CRMToolbar>

      {view === 'calendar' ? (
        <ActivityCalendar
          activities={calendarActivities.map((a) => ({
            id: a.id,
            type: a.type,
            subject: a.subject,
            status: a.status,
            dueDate: a.dueDate,
          }))}
          loading={calendarQuery.isLoading}
          onAddOnDay={(day) => {
            setDraft({ ...EMPTY_DRAFT, dueDate: `${day}T09:00` });
            setCreateOpen(true);
          }}
        />
      ) : (
        <>
      {activitiesQuery.isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-container-high" />
          ))}
        </div>
      ) : activitiesQuery.isError ? (
        <CRMErrorState
          title="Unable to load activities"
          description="The activity service did not respond. Try again in a moment."
        />
      ) : (
        <div className="space-y-3">
          {activities.map((act) => {
            const overdue = isOverdue(act);
            const typeLabel = TYPE_LABELS[act.type] ?? act.type;
            const icon = TYPE_ICONS[act.type] ?? TYPE_ICONS.TASK;
            return (
              <div
                key={act.id}
                className={`flex items-start gap-4 rounded-xl border bg-surface p-4 transition hover:shadow-sm ${
                  overdue ? 'border-error/30' : 'border-outline-variant'
                }`}
              >
                <div className="mt-0.5 rounded-lg bg-surface-container-low p-2">{icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-on-surface">{act.subject}</p>
                    <CRMStatusBadge tone={PRIORITY_TONES[act.priority] ?? 'blue'}>{act.priority}</CRMStatusBadge>
                    <CRMStatusBadge tone={STATUS_TONES[act.status] ?? 'slate'}>{act.status}</CRMStatusBadge>
                    {overdue && <CRMStatusBadge tone="rose">Overdue</CRMStatusBadge>}
                  </div>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    {typeLabel}
                    {act.dealId && (
                      <> · <Link href={`/deals/${act.dealId}`} className="text-primary hover:underline">Deal</Link></>
                    )}
                    {act.contactId && (
                      <> · <Link href={`/contacts/${act.contactId}`} className="text-primary hover:underline">Contact</Link></>
                    )}
                    {act.leadId && (
                      <> · <Link href={`/leads/${act.leadId}`} className="text-primary hover:underline">Lead</Link></>
                    )}
                  </p>
                  {act.dueDate && (
                    <p className={`mt-0.5 text-xs ${overdue ? 'text-error font-medium' : 'text-on-surface-variant'}`}>
                      Due: {new Date(act.dueDate).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-xs text-on-surface-variant">{new Date(act.createdAt).toLocaleDateString()}</span>
                  {act.status !== 'DONE' && act.status !== 'CANCELLED' && (
                    <Button
                      variant="secondary"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleComplete(act.id, act.subject)}
                      isLoading={completeActivity.isPending}
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Complete
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {activities.length === 0 && (
            <div className="rounded-xl border border-outline-variant bg-surface shadow-card">
              <CRMEmptyState
                icon={CalendarDays}
                title="No activities found"
                description={tab === 'overdue' ? 'Nothing overdue — great job!' : 'Log calls, emails, and meetings to track your engagement.'}
                action={
                  <Button onClick={openCreate}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    New activity
                  </Button>
                }
              />
            </div>
          )}
        </div>
      )}
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New activity</DialogTitle>
            <DialogDescription>Log a call, email, meeting, or task.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface">Type</label>
              <select
                value={draft.type}
                onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-on-surface">Subject</label>
              <Input
                value={draft.subject}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                placeholder="Follow up with client"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface">Priority</label>
                <select
                  value={draft.priority}
                  onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface">Due date</label>
                <Input
                  type="datetime-local"
                  value={draft.dueDate}
                  onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface">Related to</label>
                <select
                  value={draft.relatedToField}
                  onChange={(e) => setDraft((d) => ({ ...d, relatedToField: e.target.value as RelatedToField }))}
                  className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {RELATED_TO_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface">Record ID</label>
                <Input
                  value={draft.relatedToId}
                  onChange={(e) => setDraft((d) => ({ ...d, relatedToId: e.target.value }))}
                  placeholder="Paste the record ID"
                  required
                />
              </div>
            </div>
            <DialogFooter className="mt-2">
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={createActivity.isPending}>
                Create activity
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </CRMModuleShell>
  );
}
