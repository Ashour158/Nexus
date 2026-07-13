'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bolt,
  CalendarClock,
  Clock,
  Filter,
  Loader2,
  Plus,
  Trash2,
  Workflow,
  Zap,
} from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff } from '@/lib/use-bff';
import { useConfirm } from '@/hooks/use-confirm';
import { SetupHeader } from '@/components/settings/setup-ui';
import {
  AddRowButton,
  BuilderShell,
  Chip,
  Field,
  FlowConnector,
  IconButton,
  NodeCard,
  ReorderControls,
  SelectControl,
  TextAreaControl,
  TextControl,
} from '@/components/settings/builder-ui';

// ─── Types mirroring /bff/workflow/automation-rules/builder-meta ──────────────

interface MetaField {
  name: string;
  type: string;
  label: string;
}
interface MetaModule {
  module: string;
  triggerEvents: string[];
  fields: MetaField[];
}
interface TriggerType {
  value: string;
  label: string;
  description: string;
}
interface BuilderMeta {
  modules: MetaModule[];
  triggerTypes: TriggerType[];
  operators: string[];
  actionTypes: string[];
  delayUnits: string[];
  dateDirections: string[];
}

interface Condition {
  field: string;
  operator: string;
  value?: unknown;
}
interface ActionItem {
  type: string;
  config: Record<string, unknown>;
}
interface ScheduledAction {
  delay: { value: number; unit: string };
  action: ActionItem;
}
interface DateTrigger {
  dateField: string;
  offset: number;
  unit: string;
  direction: string;
  isActive: boolean;
}
interface Rule {
  id: string;
  name: string;
  description?: string | null;
  module: string;
  triggerEvent: string;
  triggerType: string;
  triggerConfig?: Record<string, unknown> | null;
  conditions: Condition[];
  actions: ActionItem[];
  scheduledActions: ScheduledAction[];
  dateTriggers?: DateTrigger[];
  isActive: boolean;
  runCount?: number;
}

type ConditionLogic = 'AND' | 'OR';

interface Draft {
  id?: string;
  name: string;
  description: string;
  module: string;
  triggerType: string;
  triggerEvent: string;
  conditionLogic: ConditionLogic;
  conditions: Condition[];
  actions: ActionItem[];
  scheduledActions: ScheduledAction[];
  dateTriggers: DateTrigger[];
  isActive: boolean;
}

/** Operators that take no value input. */
const VALUELESS_OPS = new Set([
  'exists',
  'not_exists',
  'is_empty',
  'is_not_empty',
]);
const LIST_OPS = new Set(['in', 'not_in']);

const TRIGGER_ICON: Record<string, typeof Zap> = {
  record_action: Bolt,
  field_update: Filter,
  date_time: CalendarClock,
  scheduled: Clock,
};

function emptyDraft(meta: BuilderMeta): Draft {
  const moduleName = meta.modules[0]?.module ?? '';
  const triggerEvent = meta.modules[0]?.triggerEvents[0] ?? '';
  return {
    name: '',
    description: '',
    module: moduleName,
    triggerType: meta.triggerTypes[0]?.value ?? 'record_action',
    triggerEvent,
    conditionLogic: 'AND',
    conditions: [],
    actions: [{ type: meta.actionTypes[0] ?? '', config: {} }],
    scheduledActions: [],
    dateTriggers: [],
    isActive: true,
  };
}

function draftFromRule(rule: Rule, meta: BuilderMeta): Draft {
  const logic = (rule.triggerConfig?.conditionLogic as ConditionLogic) ?? 'AND';
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description ?? '',
    module: rule.module,
    triggerType: rule.triggerType ?? 'record_action',
    triggerEvent: rule.triggerEvent,
    conditionLogic: logic === 'OR' ? 'OR' : 'AND',
    conditions: rule.conditions ?? [],
    actions: rule.actions?.length ? rule.actions : [{ type: meta.actionTypes[0] ?? '', config: {} }],
    scheduledActions: rule.scheduledActions ?? [],
    dateTriggers: rule.dateTriggers ?? [],
    isActive: rule.isActive,
  };
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function coerceValue(field: MetaField | undefined, op: string, raw: string): unknown {
  if (VALUELESS_OPS.has(op)) return undefined;
  if (LIST_OPS.has(op)) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (field?.type === 'number') {
    const n = Number(raw);
    return raw === '' ? '' : Number.isNaN(n) ? raw : n;
  }
  return raw;
}

function valueToInput(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function configToText(config: Record<string, unknown>): string {
  if (!config || Object.keys(config).length === 0) return '';
  return JSON.stringify(config, null, 2);
}
function parseConfig(text: string): Record<string, unknown> {
  const t = text.trim();
  if (!t) return {};
  try {
    const parsed = JSON.parse(t);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return { _raw: text };
  }
}

export default function WorkflowBuilderPage() {
  const { get, post, patch, del } = useBff();
  const { confirm, ConfirmDialog } = useConfirm();

  const [meta, setMeta] = useState<BuilderMeta | null>(null);
  const [metaState, setMetaState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [rules, setRules] = useState<Rule[]>([]);
  const [rulesState, setRulesState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const loadMeta = useCallback(async () => {
    setMetaState('loading');
    const res = await get<BuilderMeta>('/bff/workflow/automation-rules/builder-meta');
    if (res.ok && res.data) {
      setMeta(res.data);
      setMetaState('ready');
    } else {
      setMetaState('error');
    }
  }, [get]);

  const loadRules = useCallback(async () => {
    setRulesState('loading');
    const res = await get<Rule[]>('/bff/workflow/automation-rules');
    if (res.status === 0) {
      setRulesState('error');
      return;
    }
    setRules(Array.isArray(res.data) ? res.data : []);
    setRulesState('ready');
  }, [get]);

  useEffect(() => {
    void loadMeta();
    void loadRules();
  }, [loadMeta, loadRules]);

  const moduleMeta = useMemo(
    () => meta?.modules.find((m) => m.module === draft?.module),
    [meta, draft?.module]
  );
  const dateFields = useMemo(
    () => moduleMeta?.fields.filter((f) => f.type === 'date') ?? [],
    [moduleMeta]
  );

  function newRule() {
    if (!meta) return;
    setDraft(emptyDraft(meta));
  }

  async function editRule(rule: Rule) {
    if (!meta) return;
    // Fetch full rule (list omits dateTriggers) so the editor round-trips them.
    const res = await get<Rule>(`/bff/workflow/automation-rules/${rule.id}`);
    setDraft(draftFromRule(res.ok && res.data ? res.data : rule, meta));
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return notify.error('Give the rule a name');
    if (!draft.module || !draft.triggerEvent) return notify.error('Pick a module and trigger event');
    const cleanActions = draft.actions.filter((a) => a.type);
    const cleanScheduled = draft.scheduledActions.filter((s) => s.action.type);
    const cleanDates = draft.dateTriggers.filter((d) => d.dateField);
    if (cleanActions.length === 0 && cleanScheduled.length === 0 && cleanDates.length === 0) {
      return notify.error('Add at least one action, delayed action, or date trigger');
    }
    if (draft.triggerType === 'date_time' && cleanDates.length === 0) {
      return notify.error('A date/time rule needs at least one date trigger');
    }

    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      module: draft.module,
      triggerEvent: draft.triggerEvent,
      triggerType: draft.triggerType,
      triggerConfig: { conditionLogic: draft.conditionLogic },
      conditions: draft.conditions.filter((c) => c.field && c.operator),
      actions: cleanActions,
      scheduledActions: cleanScheduled,
      dateTriggers: cleanDates,
      isActive: draft.isActive,
    };

    setSaving(true);
    const res = draft.id
      ? await patch(`/bff/workflow/automation-rules/${draft.id}`, payload)
      : await post('/bff/workflow/automation-rules', payload);
    setSaving(false);
    if (!res.ok) return notify.error('Failed to save rule', res.error);
    notify.success(draft.id ? 'Rule updated' : 'Rule created');
    setDraft(null);
    void loadRules();
  }

  async function toggle(rule: Rule) {
    const res = await post(`/bff/workflow/automation-rules/${rule.id}/toggle`);
    if (!res.ok) return notify.error('Failed to toggle rule', res.error);
    void loadRules();
  }

  async function remove(rule: Rule) {
    const ok = await confirm({
      title: 'Delete automation rule',
      message: `Delete “${rule.name}”? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const res = await del(`/bff/workflow/automation-rules/${rule.id}`);
    if (!res.ok) return notify.error('Failed to delete rule', res.error);
    notify.success('Rule deleted');
    if (draft?.id === rule.id) setDraft(null);
    void loadRules();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <SetupHeader
        icon={Workflow}
        title="Workflow Rule Builder"
        description="Visually compose a trigger → conditions → actions automation. Add ordered actions, time-delayed follow-ups, and date-based triggers, then save it live."
        onRefresh={() => {
          void loadMeta();
          void loadRules();
        }}
      >
        <button
          type="button"
          onClick={newRule}
          disabled={!meta}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden /> New rule
        </button>
      </SetupHeader>

      {metaState === 'error' ? (
        <div className="rounded-xl border border-outline-variant bg-surface p-12 text-center text-sm text-on-surface-variant">
          Couldn&apos;t reach the workflow service. It may be starting up — try refreshing.
        </div>
      ) : (
        <BuilderShell
          rail={
            <RuleRail
              rules={rules}
              state={rulesState}
              activeId={draft?.id}
              onSelect={editRule}
              onNew={newRule}
              onToggle={toggle}
              onDelete={remove}
              canCreate={!!meta}
            />
          }
        >
          {!draft ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface-container-low/40 p-12 text-center">
              <Zap className="mb-3 h-10 w-10 text-outline" aria-hidden />
              <p className="text-sm font-medium text-on-surface">No rule selected</p>
              <p className="mt-1 max-w-sm text-xs text-on-surface-variant">
                Pick a rule from the list to edit it, or create a new one to open the visual builder.
              </p>
            </div>
          ) : meta ? (
            <RuleEditor
              draft={draft}
              meta={meta}
              moduleMeta={moduleMeta}
              dateFields={dateFields}
              saving={saving}
              set={set}
              setDraft={setDraft}
              onSave={save}
              onCancel={() => setDraft(null)}
            />
          ) : null}
        </BuilderShell>
      )}
      {ConfirmDialog}
    </div>
  );
}

// ─── Rail: rule list ──────────────────────────────────────────────────────────

function RuleRail({
  rules,
  state,
  activeId,
  onSelect,
  onNew,
  onToggle,
  onDelete,
  canCreate,
}: {
  rules: Rule[];
  state: 'loading' | 'ready' | 'error';
  activeId?: string;
  onSelect: (r: Rule) => void;
  onNew: () => void;
  onToggle: (r: Rule) => void;
  onDelete: (r: Rule) => void;
  canCreate: boolean;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface">
      <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
          Rules ({rules.length})
        </span>
      </div>
      {state === 'loading' ? (
        <div className="flex items-center justify-center gap-2 p-8 text-xs text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      ) : state === 'error' ? (
        <p className="p-6 text-center text-xs text-on-surface-variant">Service unreachable.</p>
      ) : rules.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-xs text-on-surface-variant">No rules yet.</p>
          <button
            type="button"
            onClick={onNew}
            disabled={!canCreate}
            className="mt-3 text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            Create your first rule
          </button>
        </div>
      ) : (
        <ul className="max-h-[70vh] divide-y divide-outline-variant overflow-y-auto">
          {rules.map((rule) => {
            const Icon = TRIGGER_ICON[rule.triggerType] ?? Bolt;
            return (
              <li
                key={rule.id}
                className={`group flex items-start gap-2 px-3 py-3 ${
                  activeId === rule.id ? 'bg-primary-container/40' : 'hover:bg-surface-container-low'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(rule)}
                  className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <span className="truncate text-sm font-medium text-on-surface">{rule.name}</span>
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-on-surface-variant">
                    {rule.triggerEvent}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rule.isActive}
                    aria-label={rule.isActive ? 'Deactivate rule' : 'Activate rule'}
                    onClick={() => onToggle(rule)}
                    className={`h-5 w-9 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      rule.isActive ? 'bg-primary' : 'bg-surface-container-highest'
                    }`}
                  >
                    <span
                      className={`mx-0.5 block h-4 w-4 rounded-full bg-surface shadow transition-transform ${
                        rule.isActive ? 'translate-x-4' : ''
                      }`}
                    />
                  </button>
                  <IconButton icon={Trash2} label={`Delete ${rule.name}`} tone="danger" onClick={() => onDelete(rule)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Editor ───────────────────────────────────────────────────────────────────

function RuleEditor({
  draft,
  meta,
  moduleMeta,
  dateFields,
  saving,
  set,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: Draft;
  meta: BuilderMeta;
  moduleMeta: MetaModule | undefined;
  dateFields: MetaField[];
  saving: boolean;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  onSave: () => void;
  onCancel: () => void;
}) {
  const fields = moduleMeta?.fields ?? [];
  const triggerEvents = moduleMeta?.triggerEvents ?? [];
  const showDates = draft.triggerType === 'date_time';

  return (
    <div className="space-y-6">
      {/* Basics */}
      <div className="rounded-xl border border-outline-variant bg-surface p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Rule name" className="sm:col-span-2">
            <TextControl
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Notify owner on high-value deal"
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <TextControl
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Optional — what this rule does"
            />
          </Field>
          <Field label="Module">
            <SelectControl
              value={draft.module}
              onChange={(e) => {
                const m = meta.modules.find((mm) => mm.module === e.target.value);
                setDraft((d) =>
                  d
                    ? {
                        ...d,
                        module: e.target.value,
                        triggerEvent: m?.triggerEvents[0] ?? '',
                        conditions: [],
                        dateTriggers: [],
                      }
                    : d
                );
              }}
            >
              {meta.modules.map((m) => (
                <option key={m.module} value={m.module} className="capitalize">
                  {m.module}
                </option>
              ))}
            </SelectControl>
          </Field>
          <Field label="Trigger type">
            <SelectControl value={draft.triggerType} onChange={(e) => set('triggerType', e.target.value)}>
              {meta.triggerTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </SelectControl>
          </Field>
          <Field label="Trigger event" className="sm:col-span-2">
            <SelectControl value={draft.triggerEvent} onChange={(e) => set('triggerEvent', e.target.value)}>
              {triggerEvents.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectControl>
          </Field>
        </div>
        <p className="mt-3 text-xs text-on-surface-variant">
          {meta.triggerTypes.find((t) => t.value === draft.triggerType)?.description}
        </p>
      </div>

      {/* Conditions */}
      <ConditionsEditor draft={draft} fields={fields} operators={meta.operators} setDraft={setDraft} />

      {/* Date triggers */}
      {showDates ? (
        <DateTriggersEditor
          draft={draft}
          dateFields={dateFields}
          delayUnits={meta.delayUnits}
          dateDirections={meta.dateDirections}
          setDraft={setDraft}
        />
      ) : null}

      {/* Actions */}
      <ActionsEditor draft={draft} actionTypes={meta.actionTypes} setDraft={setDraft} />

      {/* Scheduled actions */}
      <ScheduledActionsEditor
        draft={draft}
        actionTypes={meta.actionTypes}
        delayUnits={meta.delayUnits}
        setDraft={setDraft}
      />

      {/* Flow preview */}
      <FlowPreview draft={draft} fields={fields} />

      {/* Footer */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface/95 p-4 backdrop-blur">
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
            className="h-4 w-4 rounded border-outline-variant text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          Active — evaluate on matching events
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {draft.id ? 'Save changes' : 'Create rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConditionsEditor({
  draft,
  fields,
  operators,
  setDraft,
}: {
  draft: Draft;
  fields: MetaField[];
  operators: string[];
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
}) {
  const update = (i: number, patch: Partial<Condition>) =>
    setDraft((d) =>
      d ? { ...d, conditions: d.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) } : d
    );

  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-on-surface">Conditions</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-on-surface-variant">Match</span>
          <div className="inline-flex overflow-hidden rounded-lg border border-outline-variant">
            {(['AND', 'OR'] as const).map((logic) => (
              <button
                key={logic}
                type="button"
                onClick={() => setDraft((d) => (d ? { ...d, conditionLogic: logic } : d))}
                className={`px-3 py-1 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  draft.conditionLogic === logic
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface text-on-surface-variant hover:bg-surface-container-low'
                }`}
              >
                {logic === 'AND' ? 'All (AND)' : 'Any (OR)'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {draft.conditions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-outline-variant px-3 py-2 text-xs text-on-surface-variant">
          No conditions — the rule fires on every {draft.triggerEvent || 'trigger'} event.
        </p>
      ) : (
        <div className="space-y-2">
          {draft.conditions.map((cond, i) => {
            const field = fields.find((f) => f.name === cond.field);
            const valueless = VALUELESS_OPS.has(cond.operator);
            return (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-container-low/50 p-2">
                {i > 0 ? (
                  <Chip tone="op">{draft.conditionLogic}</Chip>
                ) : (
                  <span className="px-1 text-[11px] font-medium uppercase text-on-surface-variant">When</span>
                )}
                <SelectControl
                  aria-label="Field"
                  value={cond.field}
                  onChange={(e) => update(i, { field: e.target.value })}
                  className="w-40"
                >
                  <option value="">field…</option>
                  {fields.map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.label}
                    </option>
                  ))}
                </SelectControl>
                <SelectControl
                  aria-label="Operator"
                  value={cond.operator}
                  onChange={(e) =>
                    update(i, {
                      operator: e.target.value,
                      value: VALUELESS_OPS.has(e.target.value) ? undefined : cond.value,
                    })
                  }
                  className="w-36"
                >
                  {operators.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </SelectControl>
                {!valueless ? (
                  <TextControl
                    aria-label="Value"
                    value={valueToInput(cond.value)}
                    onChange={(e) => update(i, { value: coerceValue(field, cond.operator, e.target.value) })}
                    placeholder={LIST_OPS.has(cond.operator) ? 'a, b, c' : 'value'}
                    className="w-32"
                  />
                ) : (
                  <span className="px-2 py-2 text-xs text-on-surface-variant">(no value)</span>
                )}
                <IconButton
                  icon={Trash2}
                  label="Remove condition"
                  tone="danger"
                  onClick={() =>
                    setDraft((d) => (d ? { ...d, conditions: d.conditions.filter((_, j) => j !== i) } : d))
                  }
                />
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3">
        <AddRowButton
          label="Add condition"
          onClick={() =>
            setDraft((d) =>
              d
                ? {
                    ...d,
                    conditions: [
                      ...d.conditions,
                      { field: fields[0]?.name ?? '', operator: operators[0] ?? 'eq', value: '' },
                    ],
                  }
                : d
            )
          }
        />
      </div>
    </div>
  );
}

function ActionsEditor({
  draft,
  actionTypes,
  setDraft,
}: {
  draft: Draft;
  actionTypes: string[];
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
}) {
  const setActions = (updater: (a: ActionItem[]) => ActionItem[]) =>
    setDraft((d) => (d ? { ...d, actions: updater(d.actions) } : d));

  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-5">
      <h3 className="mb-3 text-sm font-semibold text-on-surface">
        Actions <span className="font-normal text-on-surface-variant">(run in order)</span>
      </h3>
      <div className="space-y-3">
        {draft.actions.map((action, i) => (
          <div key={i} className="rounded-lg border border-outline-variant bg-surface-container-low/50 p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-on-primary">
                {i + 1}
              </span>
              <SelectControl
                aria-label={`Action ${i + 1} type`}
                value={action.type}
                onChange={(e) =>
                  setActions((a) => a.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))
                }
                className="flex-1"
              >
                <option value="">Select action…</option>
                {actionTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </SelectControl>
              <ReorderControls
                index={i}
                count={draft.actions.length}
                onMove={(from, to) => setActions((a) => move(a, from, to))}
                onRemove={() => setActions((a) => a.filter((_, j) => j !== i))}
                removeLabel="Remove action"
              />
            </div>
            <TextAreaControl
              aria-label={`Action ${i + 1} config`}
              value={configToText(action.config)}
              onChange={(e) =>
                setActions((a) => a.map((x, j) => (j === i ? { ...x, config: parseConfig(e.target.value) } : x)))
              }
              rows={2}
              placeholder='config JSON — e.g. {"message":"High-value deal"}'
              className="mt-2 font-mono text-xs"
            />
          </div>
        ))}
      </div>
      <div className="mt-3">
        <AddRowButton
          label="Add action"
          onClick={() => setActions((a) => [...a, { type: actionTypes[0] ?? '', config: {} }])}
        />
      </div>
    </div>
  );
}

function ScheduledActionsEditor({
  draft,
  actionTypes,
  delayUnits,
  setDraft,
}: {
  draft: Draft;
  actionTypes: string[];
  delayUnits: string[];
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
}) {
  const setList = (updater: (a: ScheduledAction[]) => ScheduledAction[]) =>
    setDraft((d) => (d ? { ...d, scheduledActions: updater(d.scheduledActions) } : d));

  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-5">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-on-surface">
        <Clock className="h-4 w-4 text-primary" aria-hidden /> Time-delayed actions
      </h3>
      <p className="mb-3 text-xs text-on-surface-variant">
        Fire a follow-up a fixed delay after the trigger (e.g. 2 days later send a reminder).
      </p>
      {draft.scheduledActions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-outline-variant px-3 py-2 text-xs text-on-surface-variant">
          No delayed actions.
        </p>
      ) : (
        <div className="space-y-3">
          {draft.scheduledActions.map((sa, i) => (
            <div key={i} className="rounded-lg border border-outline-variant bg-surface-container-low/50 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <span className="px-1 text-[11px] font-medium uppercase text-on-surface-variant">After</span>
                <TextControl
                  aria-label="Delay value"
                  type="number"
                  min={0}
                  value={sa.delay.value}
                  onChange={(e) =>
                    setList((a) =>
                      a.map((x, j) =>
                        j === i ? { ...x, delay: { ...x.delay, value: Number(e.target.value) || 0 } } : x
                      )
                    )
                  }
                  className="w-20"
                />
                <SelectControl
                  aria-label="Delay unit"
                  value={sa.delay.unit}
                  onChange={(e) =>
                    setList((a) => a.map((x, j) => (j === i ? { ...x, delay: { ...x.delay, unit: e.target.value } } : x)))
                  }
                  className="w-28"
                >
                  {delayUnits.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </SelectControl>
                <SelectControl
                  aria-label="Delayed action type"
                  value={sa.action.type}
                  onChange={(e) =>
                    setList((a) => a.map((x, j) => (j === i ? { ...x, action: { ...x.action, type: e.target.value } } : x)))
                  }
                  className="flex-1"
                >
                  <option value="">action…</option>
                  {actionTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </SelectControl>
                <IconButton
                  icon={Trash2}
                  label="Remove delayed action"
                  tone="danger"
                  onClick={() => setList((a) => a.filter((_, j) => j !== i))}
                />
              </div>
              <TextAreaControl
                aria-label="Delayed action config"
                value={configToText(sa.action.config)}
                onChange={(e) =>
                  setList((a) =>
                    a.map((x, j) => (j === i ? { ...x, action: { ...x.action, config: parseConfig(e.target.value) } } : x))
                  )
                }
                rows={2}
                placeholder="config JSON"
                className="mt-2 font-mono text-xs"
              />
            </div>
          ))}
        </div>
      )}
      <div className="mt-3">
        <AddRowButton
          label="Add delayed action"
          onClick={() =>
            setList((a) => [
              ...a,
              { delay: { value: 1, unit: delayUnits[0] ?? 'days' }, action: { type: actionTypes[0] ?? '', config: {} } },
            ])
          }
        />
      </div>
    </div>
  );
}

function DateTriggersEditor({
  draft,
  dateFields,
  delayUnits,
  dateDirections,
  setDraft,
}: {
  draft: Draft;
  dateFields: MetaField[];
  delayUnits: string[];
  dateDirections: string[];
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
}) {
  const setList = (updater: (a: DateTrigger[]) => DateTrigger[]) =>
    setDraft((d) => (d ? { ...d, dateTriggers: updater(d.dateTriggers) } : d));

  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-5">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-on-surface">
        <CalendarClock className="h-4 w-4 text-primary" aria-hidden /> Date-based triggers
      </h3>
      <p className="mb-3 text-xs text-on-surface-variant">
        Fire relative to a date field on the record — e.g. 3 days before the expected close date.
      </p>
      {dateFields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-outline-variant px-3 py-2 text-xs text-on-surface-variant">
          This module has no date fields to trigger from.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {draft.dateTriggers.map((dt, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-container-low/50 p-2">
                <TextControl
                  aria-label="Offset"
                  type="number"
                  min={0}
                  value={dt.offset}
                  onChange={(e) => setList((a) => a.map((x, j) => (j === i ? { ...x, offset: Number(e.target.value) || 0 } : x)))}
                  className="w-20"
                />
                <SelectControl
                  aria-label="Unit"
                  value={dt.unit}
                  onChange={(e) => setList((a) => a.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))}
                  className="w-28"
                >
                  {delayUnits.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </SelectControl>
                <SelectControl
                  aria-label="Direction"
                  value={dt.direction}
                  onChange={(e) => setList((a) => a.map((x, j) => (j === i ? { ...x, direction: e.target.value } : x)))}
                  className="w-28"
                >
                  {dateDirections.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </SelectControl>
                <SelectControl
                  aria-label="Date field"
                  value={dt.dateField}
                  onChange={(e) => setList((a) => a.map((x, j) => (j === i ? { ...x, dateField: e.target.value } : x)))}
                  className="flex-1"
                >
                  <option value="">date field…</option>
                  {dateFields.map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.label}
                    </option>
                  ))}
                </SelectControl>
                <IconButton
                  icon={Trash2}
                  label="Remove date trigger"
                  tone="danger"
                  onClick={() => setList((a) => a.filter((_, j) => j !== i))}
                />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <AddRowButton
              label="Add date trigger"
              onClick={() =>
                setList((a) => [
                  ...a,
                  {
                    dateField: dateFields[0]?.name ?? '',
                    offset: 1,
                    unit: delayUnits[0] ?? 'days',
                    direction: dateDirections[0] ?? 'before',
                    isActive: true,
                  },
                ])
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Visual flow preview ──────────────────────────────────────────────────────

function FlowPreview({ draft, fields }: { draft: Draft; fields: MetaField[] }) {
  const fieldLabel = (name: string) => fields.find((f) => f.name === name)?.label ?? name;
  const TriggerIcon = TRIGGER_ICON[draft.triggerType] ?? Bolt;

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low/40 p-5">
      <h3 className="mb-4 text-sm font-semibold text-on-surface">Flow preview</h3>
      <div className="mx-auto max-w-md">
        {/* Trigger */}
        <NodeCard tone="trigger">
          <div className="flex items-center gap-2">
            <TriggerIcon className="h-5 w-5 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-on-primary-container/70">Trigger</p>
              <p className="truncate text-sm font-medium text-on-primary-container">{draft.triggerEvent || '—'}</p>
            </div>
          </div>
        </NodeCard>

        {/* Conditions */}
        {draft.conditions.filter((c) => c.field).length > 0 ? (
          <>
            <FlowConnector label="if" />
            <NodeCard tone="surface">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
                Conditions · match {draft.conditionLogic === 'AND' ? 'all' : 'any'}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {draft.conditions
                  .filter((c) => c.field)
                  .map((c, i) => (
                    <span key={i} className="inline-flex flex-wrap items-center gap-1">
                      {i > 0 ? <Chip tone="op">{draft.conditionLogic}</Chip> : null}
                      <Chip tone="field">{fieldLabel(c.field)}</Chip>
                      <Chip tone="op">{c.operator}</Chip>
                      {!VALUELESS_OPS.has(c.operator) ? <Chip>{valueToInput(c.value) || '∅'}</Chip> : null}
                    </span>
                  ))}
              </div>
            </NodeCard>
          </>
        ) : null}

        {/* Date triggers */}
        {draft.triggerType === 'date_time' && draft.dateTriggers.filter((d) => d.dateField).length > 0 ? (
          <>
            <FlowConnector label="when" />
            <NodeCard tone="surface">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">Date triggers</p>
              <ul className="space-y-1">
                {draft.dateTriggers
                  .filter((d) => d.dateField)
                  .map((d, i) => (
                    <li key={i} className="text-xs text-on-surface">
                      {d.offset} {d.unit} {d.direction} <span className="font-medium">{fieldLabel(d.dateField)}</span>
                    </li>
                  ))}
              </ul>
            </NodeCard>
          </>
        ) : null}

        {/* Actions */}
        <FlowConnector label="then" />
        {draft.actions.filter((a) => a.type).length === 0 &&
        draft.scheduledActions.filter((s) => s.action.type).length === 0 ? (
          <NodeCard tone="muted">
            <p className="text-center text-xs text-on-surface-variant">No actions yet</p>
          </NodeCard>
        ) : (
          <div className="space-y-0">
            {draft.actions
              .filter((a) => a.type)
              .map((a, i) => (
                <div key={`a-${i}`}>
                  {i > 0 ? <FlowConnector /> : null}
                  <NodeCard tone="action">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-on-primary">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium text-on-surface">{a.type}</span>
                    </div>
                  </NodeCard>
                </div>
              ))}
            {draft.scheduledActions
              .filter((s) => s.action.type)
              .map((s, i) => (
                <div key={`s-${i}`}>
                  <FlowConnector label={`+${s.delay.value} ${s.delay.unit}`} />
                  <NodeCard tone="surface">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" aria-hidden />
                      <span className="text-sm font-medium text-on-surface">{s.action.type}</span>
                      <span className="text-xs text-on-surface-variant">
                        (delayed {s.delay.value} {s.delay.unit})
                      </span>
                    </div>
                  </NodeCard>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
