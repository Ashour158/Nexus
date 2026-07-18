'use client';

import { useState } from 'react';
import { CalendarClock, Play, Plus, Trash2 } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff, useBffList } from '@/lib/use-bff';
import {
  Pill,
  PrimaryButton,
  SetupHeader,
  SetupInput,
  SetupPanel,
  SetupSelect,
  SetupTableCard,
} from '@/components/settings/setup-ui';

interface DataJob {
  id: string;
  name: string;
  kind: string;
  module: string;
  cron: string;
  isActive: boolean;
}

export default function ScheduledJobsPage() {
  const { post, del } = useBff();
  const { rows, state, reload } = useBffList<DataJob>('/bff/data/data-jobs');

  const [name, setName] = useState('');
  const [kind, setKind] = useState('EXPORT');
  const [module, setModule] = useState('account');
  const [cron, setCron] = useState('0 2 * * *');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim() || !cron.trim() || !module.trim()) return notify.error('Name, module and cron are required');
    setSaving(true);
    const res = await post('/bff/data/data-jobs', {
      name: name.trim(),
      kind,
      module: module.trim(),
      cron: cron.trim(),
      config: {},
    });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to create job', res.error);
    notify.success('Scheduled job created');
    setName('');
    void reload();
  };

  const runNow = async (job: DataJob) => {
    const res = await post(`/bff/data/data-jobs/${job.id}/run`, {});
    if (!res.ok) return notify.error('Failed to run job', res.error);
    notify.success(`Ran "${job.name}"`);
  };

  const remove = async (id: string) => {
    const res = await del(`/bff/data/data-jobs/${id}`);
    if (!res.ok) return notify.error('Failed to delete job', res.error);
    notify.success('Job deleted');
    void reload();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <SetupHeader
        icon={CalendarClock}
        title="Scheduled Jobs"
        description="Recurring import and export jobs that run on a cron schedule. Trigger any job on demand with Run now."
        onRefresh={() => void reload()}
      />

      <SetupPanel title="New scheduled job">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SetupInput label="Job name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nightly account export" />
          <SetupSelect label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="EXPORT">Export</option>
            <option value="IMPORT">Import</option>
          </SetupSelect>
          <SetupInput label="Module" value={module} onChange={(e) => setModule(e.target.value)} placeholder="e.g. account" className="font-mono" />
          <SetupInput label="Cron" value={cron} onChange={(e) => setCron(e.target.value)} className="font-mono" hint="Standard 5-field cron." />
        </div>
        <div className="flex justify-end">
          <PrimaryButton onClick={create} disabled={saving || !name.trim() || !cron.trim()}>
            <Plus className="h-4 w-4" aria-hidden /> {saving ? 'Creating…' : 'Add job'}
          </PrimaryButton>
        </div>
      </SetupPanel>

      <SetupTableCard
        state={state}
        isEmpty={rows.length === 0}
        emptyIcon={CalendarClock}
        emptyTitle="No scheduled jobs yet"
        emptyHint="Create a recurring import or export job to automate data movement."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
              <th className="px-5 py-3 text-start font-medium">Job</th>
              <th className="px-5 py-3 text-start font-medium">Kind</th>
              <th className="px-5 py-3 text-start font-medium">Module</th>
              <th className="px-5 py-3 text-start font-medium">Cron</th>
              <th className="px-5 py-3 text-center font-medium">Active</th>
              <th className="w-24 px-5 py-3 text-start font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((job, i) => (
              <tr key={job.id} className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'}`}>
                <td className="px-5 py-3 font-medium text-on-surface">{job.name}</td>
                <td className="px-5 py-3">
                  <Pill tone={job.kind === 'IMPORT' ? 'warning' : 'primary'}>{job.kind}</Pill>
                </td>
                <td className="px-5 py-3 text-on-surface-variant">{job.module}</td>
                <td className="px-5 py-3 font-mono text-xs text-on-surface-variant">{job.cron}</td>
                <td className="px-5 py-3 text-center">
                  <Pill tone={job.isActive ? 'success' : 'neutral'}>{job.isActive ? 'On' : 'Off'}</Pill>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => runNow(job)}
                      className="rounded p-1.5 text-on-surface-variant hover:bg-primary-container hover:text-on-primary-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Run ${job.name} now`}
                    >
                      <Play className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      onClick={() => remove(job.id)}
                      className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Delete ${job.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SetupTableCard>
    </div>
  );
}
