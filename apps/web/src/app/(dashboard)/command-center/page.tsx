'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Compass, Plus, Trash2, Play, Archive, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/hooks/use-confirm';
import { notify } from '@/lib/toast';
import {
  useJourneys,
  useCreateJourney,
  useDeleteJourney,
  useActivateJourney,
  useArchiveJourney,
  JOURNEY_ENTITY_TYPES,
  type JourneyEntityType,
  type JourneyStatus,
} from '@/hooks/use-command-center';

const STATUS_STYLES: Record<JourneyStatus, string> = {
  DRAFT: 'bg-surface-container-high text-on-surface-variant',
  ACTIVE: 'bg-success-container text-success',
  ARCHIVED: 'bg-warning-container text-warning',
};

export default function CommandCenterPage() {
  const { data: journeys, isLoading } = useJourneys();
  const createJourney = useCreateJourney();
  const deleteJourney = useDeleteJourney();
  const activate = useActivateJourney();
  const archive = useArchiveJourney();
  const { confirm, ConfirmDialog } = useConfirm();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; description: string; entityType: JourneyEntityType }>({
    name: '',
    description: '',
    entityType: 'contact',
  });

  const handleCreate = async () => {
    if (!form.name.trim()) {
      notify.error('Name is required');
      return;
    }
    try {
      const journey = await createJourney.mutateAsync({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        entityType: form.entityType,
        entryTrigger: {},
        steps: [],
      });
      notify.success('Journey created');
      setOpen(false);
      setForm({ name: '', description: '', entityType: 'contact' });
      void journey;
    } catch (err) {
      notify.error('Could not create journey', err instanceof Error ? err.message : undefined);
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await activate.mutateAsync(id);
      notify.success('Journey activated');
    } catch (err) {
      notify.error('Could not activate', err instanceof Error ? err.message : undefined);
    }
  };
  const handleArchive = async (id: string) => {
    try {
      await archive.mutateAsync(id);
      notify.success('Journey archived');
    } catch (err) {
      notify.error('Could not archive', err instanceof Error ? err.message : undefined);
    }
  };
  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm(`Delete "${name}" and its enrollments? This cannot be undone.`, 'Delete journey?');
    if (!ok) return;
    try {
      await deleteJourney.mutateAsync(id);
      notify.success('Journey deleted');
    } catch (err) {
      notify.error('Could not delete', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
            <Compass className="h-6 w-6 text-brand-600" /> Command Center
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Design lifecycle journeys with entry triggers, ordered steps, and enrollments.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New journey</Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : !journeys || journeys.length === 0 ? (
        <EmptyState icon="🧭" title="No journeys yet" description="Create a journey to automate a lifecycle." cta={{ label: 'New journey', onClick: () => setOpen(true) }} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-outline-variant bg-surface-container-low text-left text-xs uppercase tracking-wide text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Journey</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Steps</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {journeys.map((j) => (
                <tr key={j.id} className="hover:bg-surface-container-low">
                  <td className="px-4 py-3">
                    <Link href={`/command-center/${j.id}`} className="font-medium text-on-surface hover:text-brand-700">{j.name}</Link>
                    {j.description && <p className="mt-0.5 text-xs text-on-surface-variant">{j.description}</p>}
                  </td>
                  <td className="px-4 py-3 capitalize text-on-surface-variant">{j.entityType}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[j.status]}`}>{j.status}</span>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{j.steps.length}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {j.status !== 'ACTIVE' && (
                        <button type="button" onClick={() => handleActivate(j.id)} className="rounded p-1.5 text-on-surface-variant hover:bg-success-container hover:text-success" aria-label="Activate">
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      {j.status !== 'ARCHIVED' && (
                        <button type="button" onClick={() => handleArchive(j.id)} className="rounded p-1.5 text-on-surface-variant hover:bg-warning-container hover:text-warning" aria-label="Archive">
                          <Archive className="h-4 w-4" />
                        </button>
                      )}
                      <Link href={`/command-center/${j.id}`} className="rounded p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface" aria-label="Open editor">
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                      <button type="button" onClick={() => handleDelete(j.id, j.name)} className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-error" aria-label="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New journey" size="md">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">Name</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Onboarding" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">Entity type</label>
            <Select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value as JourneyEntityType })}>
              {JOURNEY_ENTITY_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">{t}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">Description</label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} isLoading={createJourney.isPending}>Create journey</Button>
          </div>
        </div>
      </Modal>
      {ConfirmDialog}
    </main>
  );
}
