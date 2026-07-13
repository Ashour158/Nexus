'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, GitBranch, Loader2, Plus, Trash2, Users } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff } from '@/lib/use-bff';
import { useConfirm } from '@/hooks/use-confirm';
import { SetupHeader } from '@/components/settings/setup-ui';
import {
  AddRowButton,
  BuilderShell,
  Chip,
  Field,
  IconButton,
  ReorderControls,
  SelectControl,
  StepBadge,
  TextControl,
} from '@/components/settings/builder-ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type ApproverType = 'USER' | 'ROLE' | 'MANAGER';
type QuorumMode = 'ALL' | 'ANY' | 'N_OF_M';

interface RawStep {
  order?: number;
  approverType?: ApproverType;
  approverId?: string;
  role?: string;
  canDelegate?: boolean;
  quorumMode?: QuorumMode;
  quorumSize?: number;
}
interface Policy {
  id: string;
  name: string;
  module: string;
  conditions?: Record<string, unknown> | null;
  steps?: RawStep[] | null;
  isActive: boolean;
}

interface Approver {
  approverType: ApproverType;
  role: string;
  approverId: string;
  canDelegate: boolean;
}
interface Level {
  approvers: Approver[];
  quorumMode: QuorumMode;
  quorumSize: number;
}
interface CriteriaRow {
  field: string;
  operator: string;
  value: string;
}
interface Draft {
  id?: string;
  name: string;
  module: string;
  isActive: boolean;
  criteria: CriteriaRow[];
  levels: Level[];
}

const MODULES = ['deal', 'quote', 'rfq', 'invoice', 'contract', 'lead', 'account', 'contact', 'expense'];
const CRITERIA_OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in'];
const NUMERIC_OPS = new Set(['gt', 'gte', 'lt', 'lte']);
const LIST_OPS = new Set(['in', 'not_in']);

function emptyApprover(): Approver {
  return { approverType: 'ROLE', role: '', approverId: '', canDelegate: false };
}
function emptyLevel(): Level {
  return { approvers: [emptyApprover()], quorumMode: 'ALL', quorumSize: 1 };
}
function emptyDraft(): Draft {
  return { name: '', module: MODULES[0], isActive: true, criteria: [], levels: [emptyLevel()] };
}

// ─── conditions <-> criteria rows ─────────────────────────────────────────────

function conditionsToCriteria(conditions: Record<string, unknown> | null | undefined): CriteriaRow[] {
  if (!conditions) return [];
  const rows: CriteriaRow[] = [];
  for (const [field, raw] of Object.entries(conditions)) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const obj = raw as Record<string, unknown>;
      const op = Object.keys(obj)[0] ?? 'eq';
      const v = obj[op];
      rows.push({ field, operator: op, value: Array.isArray(v) ? v.join(', ') : String(v ?? '') });
    } else {
      rows.push({ field, operator: 'eq', value: Array.isArray(raw) ? (raw as unknown[]).join(', ') : String(raw ?? '') });
    }
  }
  return rows;
}

function criteriaToConditions(rows: CriteriaRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    if (!r.field.trim()) continue;
    let value: unknown = r.value;
    if (LIST_OPS.has(r.operator)) {
      value = r.value.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (NUMERIC_OPS.has(r.operator)) {
      const n = Number(r.value);
      value = Number.isNaN(n) ? r.value : n;
    }
    out[r.field.trim()] = r.operator === 'eq' ? value : { [r.operator]: value };
  }
  return out;
}

// ─── steps (flat) <-> levels ──────────────────────────────────────────────────

function stepsToLevels(steps: RawStep[] | null | undefined): Level[] {
  if (!steps || steps.length === 0) return [emptyLevel()];
  const byOrder = new Map<number, RawStep[]>();
  steps.forEach((s, i) => {
    const ord = s.order ?? i;
    if (!byOrder.has(ord)) byOrder.set(ord, []);
    byOrder.get(ord)!.push(s);
  });
  return [...byOrder.keys()]
    .sort((a, b) => a - b)
    .map((ord) => {
      const group = byOrder.get(ord)!;
      return {
        approvers: group.map((s) => ({
          approverType: s.approverType ?? 'ROLE',
          role: s.role ?? '',
          approverId: s.approverId ?? '',
          canDelegate: s.canDelegate ?? false,
        })),
        quorumMode: group[0]?.quorumMode ?? 'ALL',
        quorumSize: group[0]?.quorumSize ?? group.length,
      };
    });
}

function levelsToSteps(levels: Level[]): RawStep[] {
  const steps: RawStep[] = [];
  levels.forEach((level, li) => {
    const order = li + 1;
    const size =
      level.quorumMode === 'ALL'
        ? level.approvers.length
        : level.quorumMode === 'ANY'
          ? 1
          : Math.min(Math.max(1, level.quorumSize || 1), level.approvers.length || 1);
    level.approvers.forEach((a) => {
      steps.push({
        order,
        approverType: a.approverType,
        ...(a.approverType === 'ROLE' ? { role: a.role.trim() } : {}),
        ...(a.approverType === 'USER' ? { approverId: a.approverId.trim() } : {}),
        canDelegate: a.canDelegate,
        quorumMode: level.quorumMode,
        quorumSize: size,
      });
    });
  });
  return steps;
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalProcessesPage() {
  const { get, post, patch, del } = useBff();
  const { confirm, ConfirmDialog } = useConfirm();

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    const res = await get<Policy[]>('/bff/workflow/approval/policies');
    if (res.status === 0) {
      setState('error');
      return;
    }
    setPolicies(Array.isArray(res.data) ? res.data : []);
    setState('ready');
  }, [get]);

  useEffect(() => {
    void load();
  }, [load]);

  function editPolicy(p: Policy) {
    setDraft({
      id: p.id,
      name: p.name,
      module: p.module,
      isActive: p.isActive,
      criteria: conditionsToCriteria(p.conditions),
      levels: stepsToLevels(p.steps),
    });
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return notify.error('Give the process a name');
    if (!draft.module.trim()) return notify.error('Pick a module');
    const levels = draft.levels.filter((l) => l.approvers.length > 0);
    if (levels.length === 0) return notify.error('Add at least one approval step');
    for (const l of levels) {
      for (const a of l.approvers) {
        if (a.approverType === 'ROLE' && !a.role.trim()) return notify.error('Every ROLE approver needs a role');
        if (a.approverType === 'USER' && !a.approverId.trim())
          return notify.error('Every USER approver needs a user id');
      }
    }
    const payload = {
      name: draft.name.trim(),
      module: draft.module.trim(),
      conditions: criteriaToConditions(draft.criteria),
      steps: levelsToSteps(levels),
      isActive: draft.isActive,
    };
    setSaving(true);
    const res = draft.id
      ? await patch(`/bff/workflow/approval/policies/${draft.id}`, payload)
      : await post('/bff/workflow/approval/policies', payload);
    setSaving(false);
    if (!res.ok) return notify.error('Failed to save process', res.error);
    notify.success(draft.id ? 'Process updated' : 'Process created');
    setDraft(null);
    void load();
  }

  async function remove(p: Policy) {
    const ok = await confirm({
      title: 'Delete approval process',
      message: `Delete “${p.name}”?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const res = await del(`/bff/workflow/approval/policies/${p.id}`);
    if (!res.ok) return notify.error('Failed to delete process', res.error);
    notify.success('Process deleted');
    if (draft?.id === p.id) setDraft(null);
    void load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <SetupHeader
        icon={CheckCircle2}
        title="Approval Process Builder"
        description="Compose an ordered sequence of approval steps. Each step can require a role, a specific user, or the requester's manager — with parallel quorum (all / any / N-of-M) settings."
        onRefresh={() => void load()}
      >
        <button
          type="button"
          onClick={() => setDraft(emptyDraft())}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus className="h-4 w-4" aria-hidden /> New process
        </button>
      </SetupHeader>

      <BuilderShell
        rail={
          <PolicyRail
            policies={policies}
            state={state}
            activeId={draft?.id}
            onSelect={editPolicy}
            onNew={() => setDraft(emptyDraft())}
            onDelete={remove}
          />
        }
      >
        {!draft ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface-container-low/40 p-12 text-center">
            <CheckCircle2 className="mb-3 h-10 w-10 text-outline" aria-hidden />
            <p className="text-sm font-medium text-on-surface">No process selected</p>
            <p className="mt-1 max-w-sm text-xs text-on-surface-variant">
              Pick a process to edit, or create a new one to build its step sequence.
            </p>
          </div>
        ) : (
          <PolicyEditor draft={draft} setDraft={setDraft} saving={saving} onSave={save} onCancel={() => setDraft(null)} />
        )}
      </BuilderShell>
      {ConfirmDialog}
    </div>
  );
}

function PolicyRail({
  policies,
  state,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  policies: Policy[];
  state: 'loading' | 'ready' | 'error';
  activeId?: string;
  onSelect: (p: Policy) => void;
  onNew: () => void;
  onDelete: (p: Policy) => void;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface">
      <div className="border-b border-outline-variant px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
          Processes ({policies.length})
        </span>
      </div>
      {state === 'loading' ? (
        <div className="flex items-center justify-center gap-2 p-8 text-xs text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      ) : state === 'error' ? (
        <p className="p-6 text-center text-xs text-on-surface-variant">Approval service unreachable.</p>
      ) : policies.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-xs text-on-surface-variant">No approval processes yet.</p>
          <button type="button" onClick={onNew} className="mt-3 text-xs font-medium text-primary hover:underline">
            Create your first process
          </button>
        </div>
      ) : (
        <ul className="max-h-[70vh] divide-y divide-outline-variant overflow-y-auto">
          {policies.map((p) => (
            <li
              key={p.id}
              className={`group flex items-center gap-2 px-3 py-3 ${
                activeId === p.id ? 'bg-primary-container/40' : 'hover:bg-surface-container-low'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(p)}
                className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-on-surface">{p.name}</span>
                  {!p.isActive ? <Chip>off</Chip> : null}
                </span>
                <span className="mt-0.5 block truncate text-[11px] capitalize text-on-surface-variant">
                  {p.module} · {(p.steps?.length ?? 0)} step(s)
                </span>
              </button>
              <IconButton icon={Trash2} label={`Delete ${p.name}`} tone="danger" onClick={() => onDelete(p)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Editor ───────────────────────────────────────────────────────────────────

function PolicyEditor({
  draft,
  setDraft,
  saving,
  onSave,
  onCancel,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const setLevels = (updater: (l: Level[]) => Level[]) =>
    setDraft((d) => (d ? { ...d, levels: updater(d.levels) } : d));
  const updateLevel = (i: number, patch: Partial<Level>) =>
    setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-6">
      {/* Basics */}
      <div className="rounded-xl border border-outline-variant bg-surface p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Process name">
            <TextControl
              value={draft.name}
              onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
              placeholder="e.g. High-value deal approval"
            />
          </Field>
          <Field label="Module">
            <SelectControl
              value={draft.module}
              onChange={(e) => setDraft((d) => (d ? { ...d, module: e.target.value } : d))}
            >
              {MODULES.map((m) => (
                <option key={m} value={m} className="capitalize">
                  {m}
                </option>
              ))}
            </SelectControl>
          </Field>
        </div>
      </div>

      {/* Entry criteria */}
      <CriteriaEditor draft={draft} setDraft={setDraft} />

      {/* Steps stepper */}
      <div className="rounded-xl border border-outline-variant bg-surface p-5">
        <h3 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-on-surface">
          <GitBranch className="h-4 w-4 text-primary" aria-hidden /> Approval steps
        </h3>
        <ol className="space-y-0">
          {draft.levels.map((level, i) => (
            <li key={i}>
              {i > 0 ? (
                <div className="ml-3.5 flex h-6 items-center" aria-hidden>
                  <span className="h-full w-px bg-outline-variant" />
                </div>
              ) : null}
              <LevelCard
                level={level}
                index={i}
                count={draft.levels.length}
                onChange={(patch) => updateLevel(i, patch)}
                onMove={(from, to) => setLevels((ls) => move(ls, from, to))}
                onRemove={() => setLevels((ls) => ls.filter((_, j) => j !== i))}
              />
            </li>
          ))}
        </ol>
        <div className="mt-4">
          <AddRowButton label="Add step" onClick={() => setLevels((ls) => [...ls, emptyLevel()])} />
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface/95 p-4 backdrop-blur">
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => setDraft((d) => (d ? { ...d, isActive: e.target.checked } : d))}
            className="h-4 w-4 rounded border-outline-variant text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          Active
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
            {draft.id ? 'Save changes' : 'Create process'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CriteriaEditor({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft | null>>;
}) {
  const setRows = (updater: (r: CriteriaRow[]) => CriteriaRow[]) =>
    setDraft((d) => (d ? { ...d, criteria: updater(d.criteria) } : d));

  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-5">
      <h3 className="mb-1 text-sm font-semibold text-on-surface">Entry criteria</h3>
      <p className="mb-3 text-xs text-on-surface-variant">
        The process applies only when a record matches all of these. Leave empty to require approval for every record.
      </p>
      {draft.criteria.length === 0 ? (
        <p className="mb-3 rounded-lg border border-dashed border-outline-variant px-3 py-2 text-xs text-on-surface-variant">
          No criteria — applies to every {draft.module}.
        </p>
      ) : (
        <div className="mb-3 space-y-2">
          {draft.criteria.map((row, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-container-low/50 p-2">
              <TextControl
                aria-label="Field"
                value={row.field}
                onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}
                placeholder="field (e.g. amount)"
                className="w-40"
              />
              <SelectControl
                aria-label="Operator"
                value={row.operator}
                onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, operator: e.target.value } : x)))}
                className="w-28"
              >
                {CRITERIA_OPS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </SelectControl>
              <TextControl
                aria-label="Value"
                value={row.value}
                onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                placeholder={LIST_OPS.has(row.operator) ? 'a, b, c' : 'value'}
                className="w-32"
              />
              <IconButton
                icon={Trash2}
                label="Remove criterion"
                tone="danger"
                onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
              />
            </div>
          ))}
        </div>
      )}
      <AddRowButton
        label="Add criterion"
        onClick={() => setRows((r) => [...r, { field: '', operator: 'gt', value: '' }])}
      />
    </div>
  );
}

function LevelCard({
  level,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  level: Level;
  index: number;
  count: number;
  onChange: (patch: Partial<Level>) => void;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
}) {
  const setApprovers = (updater: (a: Approver[]) => Approver[]) => onChange({ approvers: updater(level.approvers) });

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StepBadge n={index + 1} />
          <span className="text-sm font-medium text-on-surface">Step {index + 1}</span>
          {level.approvers.length > 1 ? (
            <Chip tone="primary">
              parallel ·{' '}
              {level.quorumMode === 'ALL'
                ? 'all must approve'
                : level.quorumMode === 'ANY'
                  ? 'any one'
                  : `${level.quorumSize} of ${level.approvers.length}`}
            </Chip>
          ) : null}
        </div>
        <ReorderControls index={index} count={count} onMove={onMove} onRemove={onRemove} removeLabel="Remove step" />
      </div>

      {/* Approvers */}
      <div className="space-y-2">
        {level.approvers.map((a, ai) => (
          <div key={ai} className="flex flex-wrap items-end gap-2 rounded-lg bg-surface p-2">
            <Users className="mb-2 h-4 w-4 text-on-surface-variant" aria-hidden />
            <SelectControl
              aria-label="Approver type"
              value={a.approverType}
              onChange={(e) =>
                setApprovers((arr) => arr.map((x, j) => (j === ai ? { ...x, approverType: e.target.value as ApproverType } : x)))
              }
              className="w-32"
            >
              <option value="ROLE">Role</option>
              <option value="USER">User</option>
              <option value="MANAGER">Manager</option>
            </SelectControl>
            {a.approverType === 'ROLE' && (
              <TextControl
                aria-label="Role"
                value={a.role}
                onChange={(e) => setApprovers((arr) => arr.map((x, j) => (j === ai ? { ...x, role: e.target.value } : x)))}
                placeholder="role (e.g. sales_manager)"
                className="flex-1"
              />
            )}
            {a.approverType === 'USER' && (
              <TextControl
                aria-label="User id"
                value={a.approverId}
                onChange={(e) => setApprovers((arr) => arr.map((x, j) => (j === ai ? { ...x, approverId: e.target.value } : x)))}
                placeholder="user id"
                className="flex-1"
              />
            )}
            {a.approverType === 'MANAGER' && (
              <span className="flex-1 px-2 py-2 text-xs text-on-surface-variant">Requester&apos;s manager</span>
            )}
            <label className="flex items-center gap-1.5 px-1 py-2 text-xs text-on-surface-variant">
              <input
                type="checkbox"
                checked={a.canDelegate}
                onChange={(e) => setApprovers((arr) => arr.map((x, j) => (j === ai ? { ...x, canDelegate: e.target.checked } : x)))}
                className="h-3.5 w-3.5 rounded border-outline-variant text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              delegate
            </label>
            <IconButton
              icon={Trash2}
              label="Remove approver"
              tone="danger"
              onClick={() => setApprovers((arr) => (arr.length > 1 ? arr.filter((_, j) => j !== ai) : arr))}
              disabled={level.approvers.length <= 1}
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <AddRowButton label="Add approver" onClick={() => setApprovers((arr) => [...arr, emptyApprover()])} />
        {level.approvers.length > 1 ? (
          <div className="flex items-end gap-2">
            <Field label="Quorum">
              <SelectControl
                value={level.quorumMode}
                onChange={(e) => onChange({ quorumMode: e.target.value as QuorumMode })}
                className="w-40"
              >
                <option value="ALL">All must approve</option>
                <option value="ANY">Any one (ANY)</option>
                <option value="N_OF_M">N of M</option>
              </SelectControl>
            </Field>
            {level.quorumMode === 'N_OF_M' ? (
              <Field label="N">
                <TextControl
                  type="number"
                  min={1}
                  max={level.approvers.length}
                  value={level.quorumSize}
                  onChange={(e) => onChange({ quorumSize: Number(e.target.value) || 1 })}
                  className="w-20"
                />
              </Field>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
