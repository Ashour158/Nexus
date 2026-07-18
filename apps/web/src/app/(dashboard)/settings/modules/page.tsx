'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Boxes, Plus, Trash2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/hooks/use-confirm';
import { notify } from '@/lib/toast';
import {
  useCustomModules,
  useCreateModule,
  useDeleteModule,
} from '@/hooks/use-custom-modules';

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export default function ModuleBuilderPage() {
  const { data: modules, isLoading } = useCustomModules();
  const createModule = useCreateModule();
  const deleteModule = useDeleteModule();
  const { confirm, ConfirmDialog } = useConfirm();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: '', pluralLabel: '', apiName: '', description: '', icon: '' });

  const resetForm = () => setForm({ label: '', pluralLabel: '', apiName: '', description: '', icon: '' });

  const handleCreate = async () => {
    if (!form.label.trim()) {
      notify.error('Label is required');
      return;
    }
    try {
      await createModule.mutateAsync({
        label: form.label.trim(),
        pluralLabel: form.pluralLabel.trim() || `${form.label.trim()}s`,
        apiName: form.apiName.trim() || slugify(form.label),
        description: form.description.trim() || undefined,
        icon: form.icon.trim() || undefined,
      });
      notify.success('Module created');
      setOpen(false);
      resetForm();
    } catch (err) {
      notify.error('Could not create module', err instanceof Error ? err.message : undefined);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    const okDelete = await confirm(
      `This removes "${label}", its fields, layouts, and all records. This cannot be undone.`,
      'Delete module?'
    );
    if (!okDelete) return;
    try {
      await deleteModule.mutateAsync(id);
      notify.success('Module deleted');
    } catch (err) {
      notify.error('Could not delete module', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
            <Boxes className="h-6 w-6 text-brand-600" />
            Module Builder
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Design low-code modules: define fields, layouts, and record data models.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New module
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : !modules || modules.length === 0 ? (
        <EmptyState
          icon="🧩"
          title="No custom modules yet"
          description="Create your first module to start building a custom data model."
          cta={{ label: 'New module', onClick: () => setOpen(true) }}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-outline-variant bg-surface-container-low text-left text-xs uppercase tracking-wide text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">API name</th>
                <th className="px-4 py-3">Records</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {modules.map((m) => (
                <tr key={m.id} className="hover:bg-surface-container-low">
                  <td className="px-4 py-3">
                    <Link href={`/settings/modules/${m.id}`} className="flex items-center gap-2 font-medium text-on-surface hover:text-brand-700">
                      <span>{m.icon ?? '📦'}</span>
                      <span>{m.pluralLabel}</span>
                    </Link>
                    {m.description && <p className="mt-0.5 text-xs text-on-surface-variant">{m.description}</p>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">{m.apiName}</td>
                  <td className="px-4 py-3">
                    <Link href={`/modules/${m.apiName}`} className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
                      View records <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/settings/modules/${m.id}`}>
                        <Button variant="secondary" size="sm">Configure</Button>
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(m.id, m.label)}
                        className="rounded-lg p-1.5 text-on-surface-variant hover:bg-error-container hover:text-error"
                        aria-label={`Delete ${m.label}`}
                      >
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

      <Modal open={open} onClose={() => setOpen(false)} title="New module" size="md">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">Singular label</label>
            <Input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value, apiName: form.apiName || slugify(e.target.value) })}
              placeholder="Project"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">Plural label</label>
            <Input value={form.pluralLabel} onChange={(e) => setForm({ ...form, pluralLabel: e.target.value })} placeholder="Projects" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">API name</label>
            <Input value={form.apiName} onChange={(e) => setForm({ ...form, apiName: slugify(e.target.value) })} placeholder="project" className="font-mono" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">Icon (emoji)</label>
            <Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="📁" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">Description</label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} isLoading={createModule.isPending}>Create module</Button>
          </div>
        </div>
      </Modal>
      {ConfirmDialog}
    </main>
  );
}
