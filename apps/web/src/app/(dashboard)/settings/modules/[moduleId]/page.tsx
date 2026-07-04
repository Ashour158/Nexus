'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  FlaskConical,
  Pencil,
  LayoutGrid,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/hooks/use-confirm';
import { notify } from '@/lib/toast';
import { cn } from '@/lib/cn';
import {
  useCustomModule,
  useModuleFields,
  useCreateField,
  useUpdateField,
  useDeleteField,
  useReorderFields,
  useModuleLayouts,
  useCreateLayout,
  useUpdateLayout,
  evaluateFormula,
  FIELD_TYPES,
  type CustomField,
  type FieldType,
  type LayoutSection,
} from '@/hooks/use-custom-modules';

const HAS_OPTIONS = (t: FieldType) => t === 'PICKLIST' || t === 'MULTISELECT';

type FieldForm = {
  label: string;
  apiName: string;
  type: FieldType;
  required: boolean;
  unique: boolean;
  options: string;
  formula: string;
};

const EMPTY_FIELD: FieldForm = {
  label: '',
  apiName: '',
  type: 'TEXT',
  required: false,
  unique: false,
  options: '',
  formula: '',
};

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export default function ModuleConfigPage() {
  const params = useParams<{ moduleId: string }>();
  const moduleId = params.moduleId;

  const { data: module, isLoading: moduleLoading } = useCustomModule(moduleId);
  const { data: fields, isLoading: fieldsLoading } = useModuleFields(moduleId);

  const [tab, setTab] = useState<'fields' | 'layout'>('fields');

  if (moduleLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-64" />
      </main>
    );
  }

  if (!module) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <EmptyState icon="🔍" title="Module not found" description="This module may have been deleted." cta={{ label: 'Back to modules', href: '/settings/modules' }} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/settings/modules" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back to modules
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <span>{module.icon ?? '📦'}</span> {module.pluralLabel}
          </h1>
          <p className="mt-1 font-mono text-xs text-slate-500">{module.apiName}</p>
        </div>
        <Link href={`/modules/${module.apiName}`}>
          <Button variant="secondary">View records</Button>
        </Link>
      </div>

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(['fields', 'layout'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize',
              tab === t ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            {t === 'layout' ? 'Canvas layout' : 'Fields'}
          </button>
        ))}
      </div>

      {tab === 'fields' ? (
        <FieldManager moduleId={moduleId} fields={fields ?? []} loading={fieldsLoading} />
      ) : (
        <LayoutEditor moduleId={moduleId} fields={fields ?? []} />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Field manager
// ---------------------------------------------------------------------------

function FieldManager({ moduleId, fields, loading }: { moduleId: string; fields: CustomField[]; loading: boolean }) {
  const createField = useCreateField(moduleId);
  const updateField = useUpdateField(moduleId);
  const deleteField = useDeleteField(moduleId);
  const reorderFields = useReorderFields(moduleId);
  const { confirm, ConfirmDialog } = useConfirm();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [form, setForm] = useState<FieldForm>(EMPTY_FIELD);
  const [formulaPreview, setFormulaPreview] = useState<string | null>(null);
  const [formulaSample, setFormulaSample] = useState('{}');

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FIELD);
    setFormulaPreview(null);
    setOpen(true);
  };
  const openEdit = (field: CustomField) => {
    setEditing(field);
    setForm({
      label: field.label,
      apiName: field.apiName,
      type: field.type,
      required: field.required,
      unique: field.unique,
      options: (field.options ?? []).join(', '),
      formula: field.formula ?? '',
    });
    setFormulaPreview(null);
    setOpen(true);
  };

  const save = async () => {
    if (!form.label.trim()) {
      notify.error('Label is required');
      return;
    }
    const payload: Partial<CustomField> = {
      label: form.label.trim(),
      apiName: form.apiName.trim() || slugify(form.label),
      type: form.type,
      required: form.required,
      unique: form.unique,
      options: HAS_OPTIONS(form.type)
        ? form.options.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      formula: form.type === 'FORMULA' ? form.formula.trim() : undefined,
    };
    try {
      if (editing) {
        await updateField.mutateAsync({ fieldId: editing.id, patch: payload });
        notify.success('Field updated');
      } else {
        await createField.mutateAsync(payload);
        notify.success('Field added');
      }
      setOpen(false);
    } catch (err) {
      notify.error('Could not save field', err instanceof Error ? err.message : undefined);
    }
  };

  const remove = async (field: CustomField) => {
    const ok = await confirm(`Delete field "${field.label}"? Existing record values for this field are removed.`, 'Delete field?');
    if (!ok) return;
    try {
      await deleteField.mutateAsync(field.id);
      notify.success('Field deleted');
    } catch (err) {
      notify.error('Could not delete field', err instanceof Error ? err.message : undefined);
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= fields.length) return;
    const order = fields.map((f) => f.id);
    [order[index], order[next]] = [order[next], order[index]];
    try {
      await reorderFields.mutateAsync(order);
    } catch (err) {
      notify.error('Could not reorder fields', err instanceof Error ? err.message : undefined);
    }
  };

  const runFormulaPreview = async () => {
    let record: Record<string, unknown> = {};
    try {
      record = JSON.parse(formulaSample || '{}');
    } catch {
      setFormulaPreview('Invalid sample JSON');
      return;
    }
    try {
      const res = await evaluateFormula(form.formula, record);
      if (!res.ok) {
        setFormulaPreview(res.error ? `Error: ${res.error}` : 'Formula error');
        return;
      }
      setFormulaPreview(String(res.value));
    } catch (err) {
      setFormulaPreview(err instanceof Error ? err.message : 'Formula error');
    }
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add field
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-48" />
      ) : fields.length === 0 ? (
        <EmptyState icon="🏷️" title="No fields yet" description="Add fields to define this module's data model." cta={{ label: 'Add field', onClick: openCreate }} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">API name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Rules</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fields.map((field, i) => (
                <tr key={field.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move up">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === fields.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Move down">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{field.label}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">{field.apiName}</td>
                  <td className="px-3 py-2"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{field.type}</span></td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {[field.required && 'required', field.unique && 'unique'].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => openEdit(field)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Edit field">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => remove(field)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete field">
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit field' : 'Add field'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Label</label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value, apiName: editing ? form.apiName : slugify(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">API name</label>
              <Input value={form.apiName} disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, apiName: slugify(e.target.value) })} className="font-mono" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Type</label>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FieldType })}>
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>

          {HAS_OPTIONS(form.type) && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Options (comma separated)</label>
              <Input value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} placeholder="Option A, Option B" />
            </div>
          )}

          {form.type === 'FORMULA' && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label className="mb-1 block text-sm font-medium text-slate-700">Formula</label>
              <Textarea value={form.formula} onChange={(e) => setForm({ ...form, formula: e.target.value })} rows={2} placeholder="budget - spent" className="font-mono" />
              <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Sample record (JSON)</label>
                  <Input value={formulaSample} onChange={(e) => setFormulaSample(e.target.value)} className="font-mono text-xs" placeholder='{"budget":100,"spent":40}' />
                </div>
                <Button variant="secondary" size="sm" onClick={runFormulaPreview}>
                  <FlaskConical className="h-4 w-4" /> Test
                </Button>
              </div>
              {formulaPreview !== null && (
                <p className="mt-2 text-sm">
                  Result: <span className="font-mono font-semibold text-brand-700">{formulaPreview}</span>
                </p>
              )}
            </div>
          )}

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} />
              Required
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.unique} onChange={(e) => setForm({ ...form, unique: e.target.checked })} />
              Unique
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} isLoading={createField.isPending || updateField.isPending}>
              {editing ? 'Save field' : 'Add field'}
            </Button>
          </div>
        </div>
      </Modal>
      {ConfirmDialog}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canvas layout editor
// ---------------------------------------------------------------------------

function LayoutEditor({ moduleId, fields }: { moduleId: string; fields: CustomField[] }) {
  const { data: layouts, isLoading } = useModuleLayouts(moduleId);
  const createLayout = useCreateLayout(moduleId);
  const updateLayout = useUpdateLayout(moduleId);

  const layout = layouts?.[0];
  const [sections, setSections] = useState<LayoutSection[] | null>(null);

  const workingSections = useMemo<LayoutSection[]>(() => {
    if (sections) return sections;
    return layout?.sections ?? [];
  }, [sections, layout]);

  const assignedFields = new Set(workingSections.flatMap((s) => s.fields));
  const unassigned = fields.filter((f) => !assignedFields.has(f.apiName));

  const mutate = (next: LayoutSection[]) => setSections(next);

  const addSection = () => mutate([...workingSections, { title: 'New section', columns: 2, fields: [] }]);
  const removeSection = (i: number) => mutate(workingSections.filter((_, idx) => idx !== i));
  const updateSection = (i: number, patch: Partial<LayoutSection>) =>
    mutate(workingSections.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addFieldToSection = (i: number, apiName: string) => {
    if (!apiName) return;
    mutate(workingSections.map((s, idx) => (idx === i ? { ...s, fields: [...s.fields, apiName] } : s)));
  };
  const removeFieldFromSection = (i: number, apiName: string) =>
    mutate(workingSections.map((s, idx) => (idx === i ? { ...s, fields: s.fields.filter((f) => f !== apiName) } : s)));

  const save = async () => {
    try {
      if (layout) {
        await updateLayout.mutateAsync({ layoutId: layout.id, patch: { sections: workingSections } });
      } else {
        await createLayout.mutateAsync({ name: 'Default Layout', sections: workingSections, isDefault: true });
      }
      setSections(null);
      notify.success('Layout saved');
    } catch (err) {
      notify.error('Could not save layout', err instanceof Error ? err.message : undefined);
    }
  };

  const labelFor = (apiName: string) => fields.find((f) => f.apiName === apiName)?.label ?? apiName;

  if (isLoading) return <Skeleton className="h-48" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <LayoutGrid className="h-4 w-4" /> Arrange fields into sections and columns for the record form.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={addSection}>
            <Plus className="h-4 w-4" /> Add section
          </Button>
          <Button size="sm" onClick={save} isLoading={createLayout.isPending || updateLayout.isPending} disabled={sections === null}>
            Save layout
          </Button>
        </div>
      </div>

      {unassigned.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Unassigned fields: {unassigned.map((f) => f.label).join(', ')}
        </div>
      )}

      {workingSections.length === 0 ? (
        <EmptyState icon="🗂️" title="No sections yet" description="Add a section to lay out the record form." cta={{ label: 'Add section', onClick: addSection }} />
      ) : (
        <div className="space-y-4">
          {workingSections.map((section, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <Input value={section.title} onChange={(e) => updateSection(i, { title: e.target.value })} className="max-w-xs" />
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  Columns
                  <Select value={String(section.columns)} onChange={(e) => updateSection(i, { columns: Number(e.target.value) })} className="w-20">
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </Select>
                </label>
                <button type="button" onClick={() => removeSection(i)} className="ml-auto rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove section">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {section.fields.map((apiName) => (
                  <span key={apiName} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
                    {labelFor(apiName)}
                    <button type="button" onClick={() => removeFieldFromSection(i, apiName)} className="text-slate-400 hover:text-red-600" aria-label={`Remove ${labelFor(apiName)}`}>×</button>
                  </span>
                ))}
                {unassigned.length > 0 && (
                  <Select
                    className="w-44"
                    value=""
                    onChange={(e) => { addFieldToSection(i, e.target.value); e.target.value = ''; }}
                  >
                    <option value="">+ Add field…</option>
                    {unassigned.map((f) => (
                      <option key={f.id} value={f.apiName}>{f.label}</option>
                    ))}
                  </Select>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
