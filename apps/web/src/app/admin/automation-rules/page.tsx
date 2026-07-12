'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  History,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useConfirm } from '@/hooks/use-confirm';
import { formatDateTime } from '@/lib/format';
import {
  useAutomationMeta,
  useAutomationRules,
  useAutomationRuleRuns,
  useCreateAutomationRule,
  useUpdateAutomationRule,
  useToggleAutomationRule,
  useDeleteAutomationRule,
  type AutomationRule,
  type AutomationRuleInput,
  type ConditionOperator,
  type RuleAction,
  type RuleCondition,
} from '@/hooks/use-automation-rules';

const RUN_STATUS_STYLES: Record<string, string> = {
  SUCCESS: 'bg-success/15 text-success',
  PARTIAL: 'bg-warning/15 text-warning',
  FAILED: 'bg-error/15 text-error',
  RUNNING: 'bg-primary/15 text-primary',
  SKIPPED: 'bg-outline/15 text-outline',
};

const inputClass =
  'w-full rounded-lg border border-outline-variant bg-inverse-surface px-3 py-2 text-sm text-inverse-on-surface placeholder-on-surface-variant/60 focus:border-primary focus:outline-none';

interface DraftState {
  id?: string;
  name: string;
  description: string;
  module: string;
  triggerEvent: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  isActive: boolean;
}

function emptyDraft(module = '', triggerEvent = ''): DraftState {
  return {
    name: '',
    description: '',
    module,
    triggerEvent,
    conditions: [],
    actions: [{ type: '', config: {} }],
    isActive: true,
  };
}

export default function AutomationRulesAdminPage() {
  const { confirm, ConfirmDialog } = useConfirm();

  const [moduleFilter, setModuleFilter] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');

  const metaQuery = useAutomationMeta();
  const meta = metaQuery.data;

  const rulesQuery = useAutomationRules({
    module: moduleFilter || undefined,
    triggerEvent: triggerFilter || undefined,
    isActive: activeFilter === '' ? undefined : activeFilter === 'true',
  });

  const toggle = useToggleAutomationRule();
  const del = useDeleteAutomationRule();

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [runsFor, setRunsFor] = useState<AutomationRule | null>(null);

  const filterTriggerEvents = useMemo(
    () => meta?.modules.find((m) => m.module === moduleFilter)?.triggerEvents ?? [],
    [meta, moduleFilter]
  );

  const rules = rulesQuery.data ?? [];

  async function handleDelete(rule: AutomationRule) {
    const ok = await confirm({
      title: 'Delete automation rule',
      message: `Delete “${rule.name}”? Its run history will also be removed. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) del.mutate(rule.id);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-primary">
            <Zap className="h-4 w-4" /> Automation
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Automation Rules</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Event-driven rules — when a record event fires, evaluate conditions and run actions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft(emptyDraft(meta?.modules[0]?.module ?? ''))}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary"
        >
          <Plus className="h-4 w-4" /> New rule
        </button>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 rounded-2xl border border-outline-variant bg-inverse-surface p-4">
        <select
          value={moduleFilter}
          onChange={(e) => {
            setModuleFilter(e.target.value);
            setTriggerFilter('');
          }}
          className={`${inputClass} w-auto min-w-[150px]`}
        >
          <option value="">All modules</option>
          {meta?.modules.map((m) => (
            <option key={m.module} value={m.module}>
              {m.module}
            </option>
          ))}
        </select>
        <select
          value={triggerFilter}
          onChange={(e) => setTriggerFilter(e.target.value)}
          disabled={!moduleFilter}
          className={`${inputClass} w-auto min-w-[180px] disabled:opacity-50`}
        >
          <option value="">All triggers</option>
          {filterTriggerEvents.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className={`${inputClass} w-auto min-w-[130px]`}
        >
          <option value="">Any state</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant bg-inverse-surface">
        {rulesQuery.isLoading || metaQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-on-surface-variant">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading rules…
          </div>
        ) : rulesQuery.isError ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-error">
            <AlertTriangle className="h-4 w-4" /> Could not load automation rules.
          </div>
        ) : rules.length === 0 ? (
          <div className="p-12 text-center">
            <Zap className="mx-auto h-8 w-8 text-on-surface-variant" />
            <p className="mt-3 text-sm text-on-surface-variant">No automation rules yet.</p>
            <button
              type="button"
              onClick={() => setDraft(emptyDraft(meta?.modules[0]?.module ?? ''))}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary"
            >
              <Plus className="h-4 w-4" /> Create your first rule
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-inverse-surface/50 text-left text-xs uppercase tracking-wide text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Rule</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Trigger</th>
                <th className="px-4 py-3 text-center">Runs</th>
                <th className="px-4 py-3 text-center">Active</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-inverse-surface/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{rule.name}</div>
                    <div className="text-xs text-on-surface-variant">
                      {rule.actions.length} action{rule.actions.length === 1 ? '' : 's'} ·{' '}
                      {rule.conditions.length} condition{rule.conditions.length === 1 ? '' : 's'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-surface-container-highest px-2 py-0.5 text-xs text-outline">
                      {rule.module}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">{rule.triggerEvent}</td>
                  <td className="px-4 py-3 text-center text-outline">{rule.runCount}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => toggle.mutate(rule.id)}
                      disabled={toggle.isPending}
                      aria-pressed={rule.isActive}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                        rule.isActive ? 'bg-success' : 'bg-inverse-surface'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-surface transition ${
                          rule.isActive ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setRunsFor(rule)}
                        className="rounded-lg p-1.5 text-on-surface-variant transition hover:bg-surface-container-highest hover:text-white"
                        title="Run history"
                      >
                        <History className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            id: rule.id,
                            name: rule.name,
                            description: rule.description ?? '',
                            module: rule.module,
                            triggerEvent: rule.triggerEvent,
                            conditions: rule.conditions ?? [],
                            actions: rule.actions?.length ? rule.actions : [{ type: '', config: {} }],
                            isActive: rule.isActive,
                          })
                        }
                        className="rounded-lg p-1.5 text-on-surface-variant transition hover:bg-surface-container-highest hover:text-white"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(rule)}
                        className="rounded-lg p-1.5 text-on-surface-variant transition hover:bg-error/10 hover:text-error"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {draft && meta && (
        <RuleFormDrawer draft={draft} setDraft={setDraft} onClose={() => setDraft(null)} meta={meta} />
      )}

      {runsFor && <RunsDrawer rule={runsFor} onClose={() => setRunsFor(null)} />}

      {ConfirmDialog}
    </div>
  );
}

// ─── Create / edit drawer ────────────────────────────────────────────────────

function RuleFormDrawer({
  draft,
  setDraft,
  onClose,
  meta,
}: {
  draft: DraftState;
  setDraft: (d: DraftState) => void;
  onClose: () => void;
  meta: NonNullable<ReturnType<typeof useAutomationMeta>['data']>;
}) {
  const create = useCreateAutomationRule();
  const update = useUpdateAutomationRule();
  const isEdit = Boolean(draft.id);
  const saving = create.isPending || update.isPending;

  const triggerEvents = meta.modules.find((m) => m.module === draft.module)?.triggerEvents ?? [];

  function set<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft({ ...draft, [key]: value });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanActions = draft.actions.filter((a) => a.type);
    if (!draft.name.trim() || !draft.module || !draft.triggerEvent || cleanActions.length === 0) {
      return;
    }
    const payload: AutomationRuleInput = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      module: draft.module,
      triggerEvent: draft.triggerEvent,
      conditions: draft.conditions.filter((c) => c.field && c.operator),
      actions: cleanActions,
      isActive: draft.isActive,
    };
    if (isEdit && draft.id) {
      update.mutate({ id: draft.id, data: payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-on-surface/50" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-outline-variant bg-inverse-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit rule' : 'New automation rule'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-highest hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-on-surface-variant">Name</label>
            <input
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Notify owner on high-value deal"
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-on-surface-variant">Description</label>
            <textarea
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-on-surface-variant">Module</label>
              <select
                value={draft.module}
                onChange={(e) => setDraft({ ...draft, module: e.target.value, triggerEvent: '' })}
                className={inputClass}
                required
              >
                <option value="">Select…</option>
                {meta.modules.map((m) => (
                  <option key={m.module} value={m.module}>
                    {m.module}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-on-surface-variant">Trigger event</label>
              <select
                value={draft.triggerEvent}
                onChange={(e) => set('triggerEvent', e.target.value)}
                disabled={!draft.module}
                className={`${inputClass} disabled:opacity-50`}
                required
              >
                <option value="">Select…</option>
                {triggerEvents.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Conditions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                Conditions <span className="text-on-surface-variant">(all must match)</span>
              </label>
              <button
                type="button"
                onClick={() =>
                  set('conditions', [...draft.conditions, { field: '', operator: 'eq', value: '' }])
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" /> Add condition
              </button>
            </div>
            {draft.conditions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-outline-variant px-3 py-2 text-xs text-on-surface-variant">
                No conditions — the rule fires on every {draft.triggerEvent || 'trigger'} event.
              </p>
            ) : (
              <div className="space-y-2">
                {draft.conditions.map((cond, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={cond.field}
                      onChange={(e) => {
                        const next = [...draft.conditions];
                        next[i] = { ...cond, field: e.target.value };
                        set('conditions', next);
                      }}
                      placeholder="field (e.g. amount)"
                      className={`${inputClass} flex-1`}
                    />
                    <select
                      value={cond.operator}
                      onChange={(e) => {
                        const next = [...draft.conditions];
                        next[i] = { ...cond, operator: e.target.value as ConditionOperator };
                        set('conditions', next);
                      }}
                      className={`${inputClass} w-auto`}
                    >
                      {meta.operators.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                    <input
                      value={valueToInput(cond.value)}
                      onChange={(e) => {
                        const next = [...draft.conditions];
                        next[i] = { ...cond, value: e.target.value };
                        set('conditions', next);
                      }}
                      placeholder="value"
                      className={`${inputClass} w-28`}
                    />
                    <button
                      type="button"
                      onClick={() => set('conditions', draft.conditions.filter((_, j) => j !== i))}
                      className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-highest hover:text-error"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">
                Actions <span className="text-on-surface-variant">(at least one)</span>
              </label>
              <button
                type="button"
                onClick={() => set('actions', [...draft.actions, { type: '', config: {} }])}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" /> Add action
              </button>
            </div>
            <div className="space-y-3">
              {draft.actions.map((action, i) => (
                <div key={i} className="rounded-lg border border-outline-variant bg-inverse-surface/50 p-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={action.type}
                      onChange={(e) => {
                        const next = [...draft.actions];
                        next[i] = { ...action, type: e.target.value };
                        set('actions', next);
                      }}
                      className={`${inputClass} flex-1`}
                    >
                      <option value="">Select action…</option>
                      {meta.actionTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    {draft.actions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => set('actions', draft.actions.filter((_, j) => j !== i))}
                        className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-highest hover:text-error"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <textarea
                    value={configToInput(action.config)}
                    onChange={(e) => {
                      const next = [...draft.actions];
                      next[i] = { ...action, config: parseConfig(e.target.value) };
                      set('actions', next);
                    }}
                    rows={2}
                    placeholder='config JSON, e.g. {"message":"High-value deal"}'
                    className={`${inputClass} mt-2 font-mono text-xs`}
                  />
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-outline">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
              className="h-4 w-4 rounded border-outline bg-inverse-surface"
            />
            Active — evaluate this rule on matching events
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-outline-variant px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-outline hover:bg-surface-container-highest">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create rule'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Runs-history drawer ─────────────────────────────────────────────────────

function RunsDrawer({ rule, onClose }: { rule: AutomationRule; onClose: () => void }) {
  const runsQuery = useAutomationRuleRuns(rule.id);
  const runs = runsQuery.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-on-surface/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-outline-variant bg-inverse-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <History className="h-4 w-4 text-primary" /> Run history
            </h2>
            <p className="text-xs text-on-surface-variant">{rule.name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-highest hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 px-6 py-5">
          {runsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-on-surface-variant">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading runs…
            </div>
          ) : runs.length === 0 ? (
            <div className="py-12 text-center">
              <Activity className="mx-auto h-7 w-7 text-on-surface-variant" />
              <p className="mt-2 text-sm text-on-surface-variant">No runs recorded yet.</p>
              <p className="text-xs text-on-surface-variant">Runs appear here once a matching event fires.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {runs.map((run) => (
                <li key={run.id} className="rounded-lg border border-outline-variant bg-inverse-surface/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${RUN_STATUS_STYLES[run.status] ?? 'bg-surface-container-high text-outline'}`}>
                      {run.status}
                    </span>
                    <span className="text-xs text-on-surface-variant">{formatDateTime(run.ranAt)}</span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-on-surface-variant">event {run.eventId.slice(0, 16)}…</p>
                  {run.error && <p className="mt-1 text-xs text-error">{run.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function valueToInput(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function configToInput(config: Record<string, unknown>): string {
  if (!config || Object.keys(config).length === 0) return '';
  return JSON.stringify(config);
}

function parseConfig(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return { _raw: text };
  }
}
