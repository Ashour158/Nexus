'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Pencil, Settings2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/hooks/use-confirm';
import { notify } from '@/lib/toast';
import { DynamicRecordForm } from '@/components/modules/dynamic-record-form';
import {
  useCustomModules,
  useModuleFields,
  useModuleLayouts,
  useModuleRecords,
  useCreateRecord,
  useUpdateRecord,
  useDeleteRecord,
  ValidationError,
  type CustomRecord,
  type FieldIssue,
} from '@/hooks/use-custom-modules';

export default function ModuleRecordsPage() {
  const params = useParams<{ moduleApiName: string }>();
  const apiName = params.moduleApiName;

  const { data: modules, isLoading: modulesLoading } = useCustomModules();
  const module = useMemo(() => modules?.find((m) => m.apiName === apiName), [modules, apiName]);
  const moduleId = module?.id;

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data: fields } = useModuleFields(moduleId);
  const { data: layouts } = useModuleLayouts(moduleId);
  const { data: records, isLoading: recordsLoading } = useModuleRecords(moduleId, { page, pageSize: 25, filter: search });

  const createRecord = useCreateRecord(moduleId ?? '');
  const updateRecord = useUpdateRecord(moduleId ?? '');
  const deleteRecord = useDeleteRecord(moduleId ?? '');
  const { confirm, ConfirmDialog } = useConfirm();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomRecord | null>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);

  const layout = layouts?.[0];
  const columns = (fields ?? []).slice(0, 4);

  const openCreate = () => {
    setEditing(null);
    setIssues([]);
    setFormOpen(true);
  };
  const openEdit = (record: CustomRecord) => {
    setEditing(record);
    setIssues([]);
    setFormOpen(true);
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    setIssues([]);
    try {
      if (editing) {
        await updateRecord.mutateAsync({ recordId: editing.id, values });
        notify.success('Record updated');
      } else {
        await createRecord.mutateAsync(values);
        notify.success('Record created');
      }
      setFormOpen(false);
    } catch (err) {
      if (err instanceof ValidationError) {
        setIssues(err.issues);
        notify.error('Please fix the highlighted fields');
      } else {
        notify.error('Could not save record', err instanceof Error ? err.message : undefined);
      }
    }
  };

  const handleDelete = async (record: CustomRecord) => {
    const ok = await confirm('Delete this record? This cannot be undone.', 'Delete record?');
    if (!ok) return;
    try {
      await deleteRecord.mutateAsync(record.id);
      notify.success('Record deleted');
    } catch (err) {
      notify.error('Could not delete record', err instanceof Error ? err.message : undefined);
    }
  };

  if (modulesLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-64" />
      </main>
    );
  }

  if (!module) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <EmptyState icon="🔍" title="Module not found" description={`No module with API name "${apiName}".`} cta={{ label: 'Module Builder', href: '/settings/modules' }} />
      </main>
    );
  }

  const rows = records?.data ?? [];
  const total = records?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <span>{module.icon ?? '📦'}</span> {module.pluralLabel}
          </h1>
          {module.description && <p className="mt-1 text-sm text-slate-500">{module.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/settings/modules/${module.id}`}>
            <Button variant="secondary"><Settings2 className="h-4 w-4" /> Configure</Button>
          </Link>
          <Button onClick={openCreate}><Plus className="h-4 w-4" /> New {module.label.toLowerCase()}</Button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search records…" className="pl-8" />
        </div>
      </div>

      {recordsLoading ? (
        <TableSkeleton rows={5} cols={Math.max(2, columns.length)} />
      ) : rows.length === 0 ? (
        <EmptyState icon="📄" title="No records" description="Create the first record for this module." cta={{ label: `New ${module.label.toLowerCase()}`, onClick: openCreate }} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((f) => (
                  <th key={f.id} className="px-4 py-3">{f.label}</th>
                ))}
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50">
                  {columns.map((f) => (
                    <td key={f.id} className="px-4 py-3 text-slate-700">
                      {formatCell(record.values[f.apiName])}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => openEdit(record)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Edit record">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(record)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete record">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
              <span className="text-slate-500">{total} records</span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="text-slate-500">Page {page} / {totalPages}</span>
                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit ${module.label.toLowerCase()}` : `New ${module.label.toLowerCase()}`} size="xl">
        <DynamicRecordForm
          fields={fields ?? []}
          layout={layout}
          initialValues={editing?.values}
          issues={issues}
          submitting={createRecord.isPending || updateRecord.isPending}
          submitLabel={editing ? 'Save changes' : 'Create record'}
          onSubmit={handleSubmit}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>
      {ConfirmDialog}
    </main>
  );
}

function formatCell(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}
