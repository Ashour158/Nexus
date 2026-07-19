'use client';

import { type ReactElement, useState } from 'react';
import { Clock, Plus, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { BiReportSchedule } from '@/lib/bi-types';
import {
  useCreateReportSchedule,
  useDeleteReportSchedule,
  useReportSchedules,
  useToggleReportSchedule,
} from '@/hooks/use-bi';

const CRON_PRESETS: Array<{ label: string; cron: string }> = [
  { label: 'Every day at 08:00', cron: '0 8 * * *' },
  { label: 'Every Monday at 08:00', cron: '0 8 * * 1' },
  { label: 'First of the month at 08:00', cron: '0 8 1 * *' },
  { label: 'Every hour', cron: '0 * * * *' },
];

const inputCls =
  'rounded-lg border border-outline-variant bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary';

/**
 * Recurring email delivery of a saved BI report: list, create (cron preset or
 * raw expression + recipients + format), pause/resume, delete. The
 * reporting-service cron runner does the sending.
 */
export function ScheduleDialog({
  reportId,
  reportName,
  onClose,
}: {
  reportId: string;
  reportName: string;
  onClose: () => void;
}): ReactElement {
  const { data: schedules, isLoading } = useReportSchedules(reportId);
  const createSchedule = useCreateReportSchedule(reportId);
  const toggleSchedule = useToggleReportSchedule(reportId);
  const deleteSchedule = useDeleteReportSchedule(reportId);

  const [cron, setCron] = useState(CRON_PRESETS[0].cron);
  const [customCron, setCustomCron] = useState(false);
  const [recipients, setRecipients] = useState('');
  const [format, setFormat] = useState('csv');
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    setFormError(null);
    const emails = recipients
      .split(/[,;\s]+/)
      .map((r) => r.trim())
      .filter(Boolean);
    if (emails.length === 0 || emails.some((e) => !e.includes('@'))) {
      setFormError('Enter at least one valid email address (comma-separated).');
      return;
    }
    try {
      await createSchedule.mutateAsync({ cron, recipients: emails, format });
      setRecipients('');
    } catch (err) {
      setFormError((err as Error).message || 'Failed to create schedule');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Schedules for ${reportName}`}
      >
        <header className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-bold text-on-surface">Email schedules</h2>
              <p className="text-xs text-on-surface-variant">{reportName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface" title="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* Existing schedules */}
          {isLoading ? (
            <p className="text-sm text-on-surface-variant">Loading schedules…</p>
          ) : !schedules?.length ? (
            <p className="text-sm text-on-surface-variant">
              No schedules yet. This report is only run when you open it.
            </p>
          ) : (
            <ul className="space-y-2">
              {schedules.map((s: BiReportSchedule) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface">
                      <code className="rounded bg-surface-container px-1">{s.cron}</code>{' '}
                      <span className="uppercase text-xs text-on-surface-variant">{s.format}</span>
                    </p>
                    <p className="truncate text-xs text-on-surface-variant">
                      → {s.recipients.join(', ')}
                      {s.nextRunAt ? ` · next ${new Date(s.nextRunAt).toLocaleString()}` : ''}
                    </p>
                    {s.lastError && (
                      <p className="truncate text-xs text-error">Last run failed: {s.lastError}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => toggleSchedule.mutate({ scheduleId: s.id, isActive: !s.isActive })}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-semibold',
                        s.isActive
                          ? 'bg-success-container text-success'
                          : 'bg-surface-container text-on-surface-variant'
                      )}
                      title={s.isActive ? 'Pause' : 'Resume'}
                    >
                      {s.isActive ? 'Active' : 'Paused'}
                    </button>
                    <button
                      onClick={() => deleteSchedule.mutate(s.id)}
                      className="rounded-md p-1.5 text-on-surface-variant hover:bg-error-container hover:text-error"
                      title="Delete schedule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Create */}
          <div className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-low/50 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              New schedule
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {!customCron ? (
                <select value={cron} onChange={(e) => setCron(e.target.value)} className={cn(inputCls, 'flex-1')}>
                  {CRON_PRESETS.map((p) => (
                    <option key={p.cron} value={p.cron}>
                      {p.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  placeholder="cron, e.g. 0 8 * * 1-5"
                  className={cn(inputCls, 'flex-1 font-mono')}
                />
              )}
              <button
                onClick={() => setCustomCron((v) => !v)}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {customCron ? 'Use preset' : 'Custom cron'}
              </button>
            </div>
            <input
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="Recipients — comma-separated emails"
              className={cn(inputCls, 'w-full')}
            />
            <div className="flex items-center justify-between gap-2">
              <select value={format} onChange={(e) => setFormat(e.target.value)} className={inputCls}>
                <option value="csv">CSV</option>
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="pdf">PDF</option>
              </select>
              <button
                onClick={submit}
                disabled={createSchedule.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> {createSchedule.isPending ? 'Creating…' : 'Add schedule'}
              </button>
            </div>
            {formError && <p className="text-xs text-error">{formError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
