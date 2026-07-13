'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, LayoutGrid, Loader2, Lock, Plus, Trash2, X } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff } from '@/lib/use-bff';
import { useConfirm } from '@/hooks/use-confirm';
import { Pill, SetupHeader } from '@/components/settings/setup-ui';
import {
  AddRowButton,
  Chip,
  Field,
  IconButton,
  ReorderControls,
  SelectControl,
  TextControl,
} from '@/components/settings/builder-ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetaField {
  apiName: string;
  label: string;
  type: string;
  source: 'standard' | 'custom';
}
interface MetaModule {
  module: string;
  label: string;
  isCustom: boolean;
  fields: MetaField[];
}
interface LayoutMeta {
  modules: MetaModule[];
  operators: string[];
  actionTypes: string[];
}
interface FieldMeta {
  required?: boolean;
  readOnly?: boolean;
}
interface Section {
  id: string;
  title: string;
  columns: number;
  fields: string[];
  fieldMeta: Record<string, FieldMeta>;
}
interface PageLayout {
  id: string;
  module: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  sections?: unknown;
}
interface RuleAction {
  type: string;
  target: string;
}
interface LayoutRule {
  id: string;
  name: string;
  triggerField: string;
  operator: string;
  triggerValue?: unknown;
  actions?: RuleAction[];
  isActive: boolean;
}

const SECTION_ACTIONS = new Set(['SHOW_SECTION', 'HIDE_SECTION']);
const VALUELESS_RULE_OPS = new Set(['is_empty', 'is_not_empty']);

let sidCounter = 0;
const newSectionId = () => `sec_${Date.now()}_${sidCounter++}`;

function normalizeSections(raw: unknown): Section[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s, i) => {
    const obj = (s ?? {}) as Record<string, unknown>;
    const fm = (obj.fieldMeta ?? {}) as Record<string, FieldMeta>;
    return {
      id: typeof obj.id === 'string' ? obj.id : `sec_${i}`,
      title: typeof obj.title === 'string' ? obj.title : `Section ${i + 1}`,
      columns: typeof obj.columns === 'number' ? obj.columns : 1,
      fields: Array.isArray(obj.fields) ? (obj.fields as unknown[]).map(String) : [],
      fieldMeta: fm && typeof fm === 'object' ? fm : {},
    };
  });
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function LayoutEditorPage() {
  const { get, post, patch, del } = useBff();
  const { confirm, ConfirmDialog } = useConfirm();

  const [meta, setMeta] = useState<LayoutMeta | null>(null);
  const [layouts, setLayouts] = useState<PageLayout[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const [selected, setSelected] = useState<PageLayout | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [rules, setRules] = useState<LayoutRule[]>([]);
  const [saving, setSaving] = useState(false);

  // Create-layout form
  const [creating, setCreating] = useState(false);
  const [newModule, setNewModule] = useState('');
  const [newName, setNewName] = useState('');
  const [newDefault, setNewDefault] = useState(false);

  const loadAll = useCallback(async () => {
    setState('loading');
    const [metaRes, listRes] = await Promise.all([
      get<LayoutMeta>('/bff/metadata/layouts/meta'),
      get<PageLayout[]>('/bff/metadata/layouts'),
    ]);
    if (metaRes.ok && metaRes.data) {
      setMeta(metaRes.data);
      if (!newModule) setNewModule(metaRes.data.modules[0]?.module ?? '');
    }
    if (listRes.status === 0 && !metaRes.ok) {
      setState('error');
      return;
    }
    setLayouts(Array.isArray(listRes.data) ? listRes.data : []);
    setState('ready');
  }, [get, newModule]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moduleMeta = useMemo(
    () => meta?.modules.find((m) => m.module === selected?.module),
    [meta, selected?.module]
  );

  const placed = useMemo(() => new Set(sections.flatMap((s) => s.fields)), [sections]);
  const palette = useMemo(
    () => (moduleMeta?.fields ?? []).filter((f) => !placed.has(f.apiName)),
    [moduleMeta, placed]
  );
  const fieldLabel = useCallback(
    (apiName: string) => moduleMeta?.fields.find((f) => f.apiName === apiName)?.label ?? apiName,
    [moduleMeta]
  );

  async function selectLayout(layout: PageLayout) {
    const res = await get<PageLayout>(`/bff/metadata/layouts/${layout.id}`);
    const full = res.ok && res.data ? res.data : layout;
    setSelected(full);
    let secs = normalizeSections(full.sections);
    if (secs.length === 0) {
      secs = [{ id: newSectionId(), title: 'Section 1', columns: 2, fields: [], fieldMeta: {} }];
    }
    setSections(secs);
    const rulesRes = await get<LayoutRule[]>(`/bff/metadata/layouts/${layout.id}/rules`);
    setRules(Array.isArray(rulesRes.data) ? rulesRes.data : []);
  }

  async function createLayout() {
    if (!newName.trim()) return notify.error('Enter a layout name');
    if (!newModule) return notify.error('Pick a module');
    const res = await post<PageLayout>('/bff/metadata/layouts', {
      module: newModule,
      name: newName.trim(),
      isDefault: newDefault,
      sections: [{ id: newSectionId(), title: 'Section 1', columns: 2, fields: [] }],
    });
    if (!res.ok) return notify.error('Failed to create layout', res.error);
    notify.success('Layout created');
    setCreating(false);
    setNewName('');
    setNewDefault(false);
    await loadAll();
    if (res.data) void selectLayout(res.data);
  }

  async function saveLayout() {
    if (!selected) return;
    setSaving(true);
    const res = await patch(`/bff/metadata/layouts/${selected.id}`, {
      sections: sections.map((s) => ({
        id: s.id,
        title: s.title,
        columns: s.columns,
        fields: s.fields,
        fieldMeta: s.fieldMeta,
      })),
    });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to save layout', res.error);
    notify.success('Layout saved');
  }

  async function removeLayout(layout: PageLayout) {
    const ok = await confirm({
      title: 'Delete layout',
      message: `Delete “${layout.name}”? Its layout rules are removed too.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const res = await del(`/bff/metadata/layouts/${layout.id}`);
    if (!res.ok) return notify.error('Failed to delete layout', res.error);
    notify.success('Layout deleted');
    if (selected?.id === layout.id) setSelected(null);
    void loadAll();
  }

  // ── Section / field mutations ──
  const addField = (sectionIdx: number, apiName: string) =>
    setSections((secs) =>
      secs.map((s, i) => (i === sectionIdx ? { ...s, fields: [...s.fields, apiName] } : s))
    );
  const removeField = (sectionIdx: number, apiName: string) =>
    setSections((secs) =>
      secs.map((s, i) => {
        if (i !== sectionIdx) return s;
        const { [apiName]: _drop, ...rest } = s.fieldMeta;
        return { ...s, fields: s.fields.filter((f) => f !== apiName), fieldMeta: rest };
      })
    );
  const reorderField = (sectionIdx: number, from: number, to: number) =>
    setSections((secs) => secs.map((s, i) => (i === sectionIdx ? { ...s, fields: move(s.fields, from, to) } : s)));
  const moveFieldToSection = (fromIdx: number, apiName: string, toIdx: number) =>
    setSections((secs) => {
      if (fromIdx === toIdx) return secs;
      const meta = secs[fromIdx].fieldMeta[apiName];
      return secs.map((s, i) => {
        if (i === fromIdx) {
          const { [apiName]: _d, ...rest } = s.fieldMeta;
          return { ...s, fields: s.fields.filter((f) => f !== apiName), fieldMeta: rest };
        }
        if (i === toIdx) {
          return { ...s, fields: [...s.fields, apiName], fieldMeta: meta ? { ...s.fieldMeta, [apiName]: meta } : s.fieldMeta };
        }
        return s;
      });
    });
  const setFieldMeta = (sectionIdx: number, apiName: string, patch: FieldMeta) =>
    setSections((secs) =>
      secs.map((s, i) =>
        i === sectionIdx
          ? { ...s, fieldMeta: { ...s.fieldMeta, [apiName]: { ...s.fieldMeta[apiName], ...patch } } }
          : s
      )
    );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <SetupHeader
        icon={LayoutGrid}
        title="Page Layout Editor"
        description="Arrange sections and fields for a module's record page, mark fields required or read-only, attach conditional layout rules, and preview the result live."
        onRefresh={() => void loadAll()}
      >
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus className="h-4 w-4" aria-hidden /> New layout
        </button>
      </SetupHeader>

      {creating ? (
        <div className="space-y-4 rounded-xl border border-primary/40 bg-primary-container p-5">
          <h3 className="font-semibold text-on-primary-container">New page layout</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Module">
              <SelectControl value={newModule} onChange={(e) => setNewModule(e.target.value)}>
                {meta?.modules.map((m) => (
                  <option key={m.module} value={m.module}>
                    {m.label}
                  </option>
                ))}
              </SelectControl>
            </Field>
            <Field label="Layout name">
              <TextControl value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Enterprise deal layout" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-on-primary-container">
            <input
              type="checkbox"
              checked={newDefault}
              onChange={(e) => setNewDefault(e.target.checked)}
              className="h-4 w-4 rounded border-outline-variant"
            />
            Make this the default layout for the module
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-on-primary-container hover:bg-primary/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createLayout}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Plus className="h-4 w-4" aria-hidden /> Create
            </button>
          </div>
        </div>
      ) : null}

      {/* Layout list */}
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
        {state === 'loading' ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading layouts…
          </div>
        ) : state === 'error' ? (
          <p className="p-8 text-center text-sm text-on-surface-variant">Metadata service unreachable.</p>
        ) : layouts.length === 0 ? (
          <p className="p-8 text-center text-sm text-on-surface-variant">No page layouts yet. Create one to begin.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
                <th className="px-5 py-3 text-start font-medium">Layout</th>
                <th className="px-5 py-3 text-start font-medium">Module</th>
                <th className="px-5 py-3 text-start font-medium">Default</th>
                <th className="w-16 px-5 py-3 text-start font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {layouts.map((layout, i) => (
                <tr
                  key={layout.id}
                  onClick={() => void selectLayout(layout)}
                  className={`cursor-pointer border-b border-outline-variant ${
                    selected?.id === layout.id ? 'bg-primary-container/40' : i % 2 ? 'bg-surface-container-low/50' : ''
                  } hover:bg-primary-container/30`}
                >
                  <td className="px-5 py-3 font-medium text-on-surface">{layout.name}</td>
                  <td className="px-5 py-3 capitalize text-on-surface-variant">{layout.module}</td>
                  <td className="px-5 py-3">{layout.isDefault ? <Pill tone="success">Default</Pill> : '—'}</td>
                  <td className="px-5 py-3">
                    <span onClick={(e) => e.stopPropagation()}>
                      <IconButton icon={Trash2} label={`Delete ${layout.name}`} tone="danger" onClick={() => removeLayout(layout)} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Editor */}
      {selected ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-on-surface">
              Editing <span className="text-primary">{selected.name}</span>{' '}
              <span className="text-sm font-normal capitalize text-on-surface-variant">({selected.module})</span>
            </h2>
            <button
              type="button"
              onClick={saveLayout}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Save layout
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* Left: builder */}
            <div className="space-y-4">
              {/* Palette */}
              <div className="rounded-xl border border-outline-variant bg-surface p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  Available fields
                </p>
                {palette.length === 0 ? (
                  <p className="text-xs text-on-surface-variant">All fields are placed.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {palette.map((f) => (
                      <span key={f.apiName} className="inline-flex items-center gap-1 rounded-md bg-surface-container-high px-2 py-1 text-xs text-on-surface">
                        {f.label}
                        <span className="text-[10px] text-on-surface-variant">{f.type}</span>
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[11px] text-on-surface-variant">
                  Use “Add field” inside a section to place these.
                </p>
              </div>

              {/* Sections */}
              {sections.map((section, si) => (
                <SectionEditor
                  key={section.id}
                  section={section}
                  sectionIdx={si}
                  sectionCount={sections.length}
                  sections={sections}
                  palette={palette}
                  fieldLabel={fieldLabel}
                  onTitle={(title) => setSections((s) => s.map((x, i) => (i === si ? { ...x, title } : x)))}
                  onColumns={(columns) => setSections((s) => s.map((x, i) => (i === si ? { ...x, columns } : x)))}
                  onMoveSection={(from, to) => setSections((s) => move(s, from, to))}
                  onRemoveSection={() => setSections((s) => (s.length > 1 ? s.filter((_, i) => i !== si) : s))}
                  onAddField={(apiName) => addField(si, apiName)}
                  onRemoveField={(apiName) => removeField(si, apiName)}
                  onReorderField={(from, to) => reorderField(si, from, to)}
                  onMoveFieldToSection={(apiName, toIdx) => moveFieldToSection(si, apiName, toIdx)}
                  onFieldMeta={(apiName, patch) => setFieldMeta(si, apiName, patch)}
                />
              ))}
              <AddRowButton
                label="Add section"
                onClick={() =>
                  setSections((s) => [
                    ...s,
                    { id: newSectionId(), title: `Section ${s.length + 1}`, columns: 2, fields: [], fieldMeta: {} },
                  ])
                }
              />
            </div>

            {/* Right: live preview */}
            <div className="lg:sticky lg:top-4 lg:self-start">
              <LayoutPreview sections={sections} fieldLabel={fieldLabel} />
            </div>
          </div>

          {/* Layout rules */}
          <LayoutRulesEditor
            layoutId={selected.id}
            rules={rules}
            setRules={setRules}
            sections={sections}
            fields={moduleMeta?.fields ?? []}
            operators={meta?.operators ?? []}
            actionTypes={meta?.actionTypes ?? []}
            fieldLabel={fieldLabel}
          />
        </div>
      ) : null}
      {ConfirmDialog}
    </div>
  );
}

// ─── Section editor ───────────────────────────────────────────────────────────

function SectionEditor({
  section,
  sectionIdx,
  sectionCount,
  sections,
  palette,
  fieldLabel,
  onTitle,
  onColumns,
  onMoveSection,
  onRemoveSection,
  onAddField,
  onRemoveField,
  onReorderField,
  onMoveFieldToSection,
  onFieldMeta,
}: {
  section: Section;
  sectionIdx: number;
  sectionCount: number;
  sections: Section[];
  palette: MetaField[];
  fieldLabel: (a: string) => string;
  onTitle: (t: string) => void;
  onColumns: (c: number) => void;
  onMoveSection: (from: number, to: number) => void;
  onRemoveSection: () => void;
  onAddField: (apiName: string) => void;
  onRemoveField: (apiName: string) => void;
  onReorderField: (from: number, to: number) => void;
  onMoveFieldToSection: (apiName: string, toIdx: number) => void;
  onFieldMeta: (apiName: string, patch: FieldMeta) => void;
}) {
  const [addValue, setAddValue] = useState('');

  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Field label="Section title" className="flex-1">
          <TextControl value={section.title} onChange={(e) => onTitle(e.target.value)} placeholder="Section title" />
        </Field>
        <Field label="Columns">
          <SelectControl value={section.columns} onChange={(e) => onColumns(Number(e.target.value))} className="w-24">
            {[1, 2, 3].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectControl>
        </Field>
        <ReorderControls
          index={sectionIdx}
          count={sectionCount}
          onMove={onMoveSection}
          onRemove={onRemoveSection}
          removeLabel="Remove section"
        />
      </div>

      {section.fields.length === 0 ? (
        <p className="mb-3 rounded-lg border border-dashed border-outline-variant px-3 py-3 text-center text-xs text-on-surface-variant">
          No fields in this section yet.
        </p>
      ) : (
        <ul className="mb-3 space-y-1.5">
          {section.fields.map((apiName, fi) => {
            const fm = section.fieldMeta[apiName] ?? {};
            return (
              <li key={apiName} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-container-low/60 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{fieldLabel(apiName)}</span>
                <label className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                  <input
                    type="checkbox"
                    checked={!!fm.required}
                    onChange={(e) => onFieldMeta(apiName, { required: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-outline-variant text-primary"
                  />
                  req
                </label>
                <label className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                  <input
                    type="checkbox"
                    checked={!!fm.readOnly}
                    onChange={(e) => onFieldMeta(apiName, { readOnly: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-outline-variant text-primary"
                  />
                  read-only
                </label>
                {sectionCount > 1 ? (
                  <SelectControl
                    aria-label="Move to section"
                    value=""
                    onChange={(e) => {
                      if (e.target.value !== '') onMoveFieldToSection(apiName, Number(e.target.value));
                    }}
                    className="w-28"
                  >
                    <option value="">move to…</option>
                    {sections.map((s, i) =>
                      i === sectionIdx ? null : (
                        <option key={s.id} value={i}>
                          {s.title || `Section ${i + 1}`}
                        </option>
                      )
                    )}
                  </SelectControl>
                ) : null}
                <ReorderControls
                  index={fi}
                  count={section.fields.length}
                  onMove={onReorderField}
                  onRemove={() => onRemoveField(apiName)}
                  removeLabel={`Remove ${fieldLabel(apiName)}`}
                />
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <SelectControl
          aria-label="Add field"
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          className="w-52"
          disabled={palette.length === 0}
        >
          <option value="">{palette.length === 0 ? 'No fields left' : 'Add field…'}</option>
          {palette.map((f) => (
            <option key={f.apiName} value={f.apiName}>
              {f.label}
            </option>
          ))}
        </SelectControl>
        <button
          type="button"
          disabled={!addValue}
          onClick={() => {
            if (addValue) {
              onAddField(addValue);
              setAddValue('');
            }
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-2 text-xs font-medium text-on-surface-variant hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add field
        </button>
      </div>
    </div>
  );
}

// ─── Live preview ─────────────────────────────────────────────────────────────

function LayoutPreview({
  sections,
  fieldLabel,
}: {
  sections: Section[];
  fieldLabel: (a: string) => string;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low/40 p-4">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
        <Eye className="h-4 w-4" aria-hidden /> Live preview
      </p>
      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.id} className="rounded-lg border border-outline-variant bg-surface p-3">
            <p className="mb-2 border-b border-outline-variant pb-1.5 text-sm font-semibold text-on-surface">
              {section.title || 'Untitled section'}
            </p>
            {section.fields.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-on-surface-variant">Empty</p>
            ) : (
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${Math.min(section.columns, 3)}, minmax(0, 1fr))` }}
              >
                {section.fields.map((apiName) => {
                  const fm = section.fieldMeta[apiName] ?? {};
                  return (
                    <div key={apiName} className="min-w-0">
                      <p className="mb-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-on-surface-variant">
                        {fieldLabel(apiName)}
                        {fm.required ? <span className="text-danger">*</span> : null}
                        {fm.readOnly ? <Lock className="h-3 w-3 text-on-surface-variant" aria-hidden /> : null}
                      </p>
                      <div
                        className={`h-7 rounded-md border border-outline-variant ${
                          fm.readOnly ? 'bg-surface-container-highest' : 'bg-surface-container-low'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Layout rules ─────────────────────────────────────────────────────────────

function LayoutRulesEditor({
  layoutId,
  rules,
  setRules,
  sections,
  fields,
  operators,
  actionTypes,
  fieldLabel,
}: {
  layoutId: string;
  rules: LayoutRule[];
  setRules: React.Dispatch<React.SetStateAction<LayoutRule[]>>;
  sections: Section[];
  fields: MetaField[];
  operators: string[];
  actionTypes: string[];
  fieldLabel: (a: string) => string;
}) {
  const { post, del } = useBff();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [triggerField, setTriggerField] = useState(fields[0]?.apiName ?? '');
  const [operator, setOperator] = useState(operators[0] ?? 'eq');
  const [triggerValue, setTriggerValue] = useState('');
  const [actionType, setActionType] = useState(actionTypes[0] ?? 'SHOW_FIELD');
  const [actionTarget, setActionTarget] = useState('');
  const [saving, setSaving] = useState(false);

  const targetIsSection = SECTION_ACTIONS.has(actionType);
  const valueless = VALUELESS_RULE_OPS.has(operator);

  async function create() {
    if (!name.trim()) return notify.error('Enter a rule name');
    if (!triggerField) return notify.error('Pick a trigger field');
    if (!actionTarget) return notify.error('Pick an action target');
    setSaving(true);
    const res = await post<LayoutRule>(`/bff/metadata/layouts/${layoutId}/rules`, {
      name: name.trim(),
      triggerField,
      operator,
      triggerValue: valueless ? undefined : triggerValue,
      actions: [{ type: actionType, target: actionTarget }],
      isActive: true,
    });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to create rule', res.error);
    notify.success('Layout rule created');
    if (res.data) setRules((r) => [...r, res.data as LayoutRule]);
    setName('');
    setTriggerValue('');
    setActionTarget('');
    setOpen(false);
  }

  async function remove(rule: LayoutRule) {
    const res = await del(`/bff/metadata/layouts/${layoutId}/rules/${rule.id}`);
    if (!res.ok) return notify.error('Failed to delete rule', res.error);
    setRules((r) => r.filter((x) => x.id !== rule.id));
  }

  const targetLabel = (rule: LayoutRule) => {
    const a = rule.actions?.[0];
    if (!a) return '';
    if (SECTION_ACTIONS.has(a.type)) {
      const sec = sections.find((s) => s.id === a.target);
      return sec?.title ?? a.target;
    }
    return fieldLabel(a.target);
  };

  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-on-surface">Layout rules</h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add rule
        </button>
      </div>

      {open ? (
        <div className="mb-4 space-y-3 rounded-lg border border-outline-variant bg-surface-container-low/50 p-3">
          <Field label="Rule name">
            <TextControl value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Show discount reason when discounted" />
          </Field>
          <div className="flex flex-wrap items-end gap-2">
            <span className="px-1 py-2 text-[11px] font-medium uppercase text-on-surface-variant">When</span>
            <SelectControl aria-label="Trigger field" value={triggerField} onChange={(e) => setTriggerField(e.target.value)} className="w-40">
              {fields.map((f) => (
                <option key={f.apiName} value={f.apiName}>
                  {f.label}
                </option>
              ))}
            </SelectControl>
            <SelectControl aria-label="Operator" value={operator} onChange={(e) => setOperator(e.target.value)} className="w-28">
              {operators.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </SelectControl>
            {!valueless ? (
              <TextControl aria-label="Value" value={triggerValue} onChange={(e) => setTriggerValue(e.target.value)} placeholder="value" className="w-28" />
            ) : null}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <span className="px-1 py-2 text-[11px] font-medium uppercase text-on-surface-variant">Then</span>
            <SelectControl
              aria-label="Action"
              value={actionType}
              onChange={(e) => {
                setActionType(e.target.value);
                setActionTarget('');
              }}
              className="w-44"
            >
              {actionTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectControl>
            <SelectControl
              aria-label="Target"
              value={actionTarget}
              onChange={(e) => setActionTarget(e.target.value)}
              className="w-44"
            >
              <option value="">{targetIsSection ? 'section…' : 'field…'}</option>
              {targetIsSection
                ? sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title || 'Untitled'}
                    </option>
                  ))
                : fields.map((f) => (
                    <option key={f.apiName} value={f.apiName}>
                      {f.label}
                    </option>
                  ))}
            </SelectControl>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={create}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Save rule
            </button>
          </div>
        </div>
      ) : null}

      {rules.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          No dynamic rules. Rules conditionally show, hide, require, or lock fields and sections based on a field value.
        </p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2"
            >
              <span className="text-sm font-medium text-on-surface">{rule.name}</span>
              <span className="flex flex-wrap items-center gap-1 text-xs text-on-surface-variant">
                when <Chip tone="field">{fieldLabel(rule.triggerField)}</Chip>
                <Chip tone="op">{rule.operator}</Chip>
                {!VALUELESS_RULE_OPS.has(rule.operator) ? <Chip>{String(rule.triggerValue ?? '')}</Chip> : null}
                then <Chip tone="primary">{rule.actions?.[0]?.type ?? '—'}</Chip>
                <Chip tone="field">{targetLabel(rule)}</Chip>
              </span>
              <span className="ml-auto">
                <IconButton icon={X} label={`Delete ${rule.name}`} tone="danger" onClick={() => remove(rule)} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
