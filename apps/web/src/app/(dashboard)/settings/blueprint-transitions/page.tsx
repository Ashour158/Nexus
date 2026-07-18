'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Compass, Loader2, Plus, Trash2, X } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff, useBffList } from '@/lib/use-bff';
import { useConfirm } from '@/hooks/use-confirm';
import { SetupHeader, SetupSelect } from '@/components/settings/setup-ui';
import {
  AddRowButton,
  Chip,
  Field,
  IconButton,
  SelectControl,
  TextControl,
} from '@/components/settings/builder-ui';

interface Playbook {
  id: string;
  name: string;
}
interface RawStage {
  id?: string;
  stageId?: string;
  name?: string;
  stageName?: string;
  position?: number;
}
interface Stage {
  key: string;
  name: string;
  position: number;
}
interface Criterion {
  type: 'required_field' | 'min_value' | 'activity_completed' | 'contact_linked';
  field?: string;
  minValue?: number;
  activityType?: string;
  errorMessage?: string;
}
interface FieldUpdate {
  field: string;
  value: string;
}
interface Transition {
  id: string;
  name: string;
  fromStageId: string;
  toStageId: string;
  slaMinutes?: number | null;
  beforeConditions?: { criteria?: Criterion[]; allowedRoles?: string[] } | null;
  afterActions?: { fieldUpdates?: FieldUpdate[] } | null;
}

const CRITERION_TYPES: { value: Criterion['type']; label: string }[] = [
  { value: 'required_field', label: 'Field is required' },
  { value: 'min_value', label: 'Minimum value' },
  { value: 'activity_completed', label: 'Activity completed' },
  { value: 'contact_linked', label: 'Contact linked' },
];

// ─── Graph layout constants ───────────────────────────────────────────────────
const NODE_W = 176;
const NODE_H = 52;
const LAYER_GAP = 108;
const SVG_PAD = 24;
const CENTER_X = 260;
const SVG_W = 520;

export default function BlueprintDesignerPage() {
  const { get, post, patch, del } = useBff();
  const { confirm, ConfirmDialog } = useConfirm();
  const { rows: playbooks, state: pbState, reload: reloadPlaybooks } =
    useBffList<Playbook>('/bff/blueprint/blueprints/playbooks');

  const [playbookId, setPlaybookId] = useState('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [tState, setTState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [editing, setEditing] = useState<Transition | 'new' | null>(null);

  useEffect(() => {
    if (!playbookId && playbooks.length > 0) setPlaybookId(playbooks[0].id);
  }, [playbooks, playbookId]);

  const loadGraph = useCallback(
    async (id: string) => {
      setTState('loading');
      const [detail, trans] = await Promise.all([
        get<{ stages?: RawStage[] }>(`/bff/blueprint/blueprints/playbooks/${id}`),
        get<Transition[]>(`/bff/blueprint/blueprints/playbooks/${id}/transitions`),
      ]);
      const rawStages = Array.isArray(detail.data?.stages) ? detail.data!.stages! : [];
      const normalized: Stage[] = rawStages.map((s, i) => ({
        key: s.stageId ?? s.id ?? String(i),
        name: s.stageName ?? s.name ?? `Stage ${i + 1}`,
        position: s.position ?? i,
      }));
      normalized.sort((a, b) => a.position - b.position);
      setStages(normalized);
      setTransitions(Array.isArray(trans.data) ? trans.data : []);
      setTState(trans.status === 0 ? 'error' : 'ready');
    },
    [get]
  );

  useEffect(() => {
    if (playbookId) void loadGraph(playbookId);
  }, [playbookId, loadGraph]);

  const stageName = (key: string) => stages.find((s) => s.key === key)?.name ?? key;

  const save = async (payload: Partial<Transition>, id?: string) => {
    const base = `/bff/blueprint/blueprints/playbooks/${playbookId}/transitions`;
    const res = id ? await patch(`${base}/${id}`, payload) : await post(base, payload);
    if (!res.ok) {
      notify.error('Failed to save transition', res.error);
      return false;
    }
    notify.success(id ? 'Transition updated' : 'Transition created');
    setEditing(null);
    void loadGraph(playbookId);
    return true;
  };

  const remove = async (t: Transition) => {
    const ok = await confirm({
      title: 'Delete transition',
      message: `Delete “${t.name}”?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const res = await del(`/bff/blueprint/blueprints/playbooks/${playbookId}/transitions/${t.id}`);
    if (!res.ok) return notify.error('Failed to delete transition', res.error);
    notify.success('Transition deleted');
    setEditing(null);
    void loadGraph(playbookId);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <SetupHeader
        icon={Compass}
        title="Blueprint State-Machine Designer"
        description="Visualize a playbook as a state graph — stages are nodes, transitions are labeled edges. Click any transition to edit its guard conditions, SLA, and after-actions."
        onRefresh={() => void reloadPlaybooks()}
      />

      {pbState === 'ready' && playbooks.length === 0 ? (
        <EmptyPanel
          title="No blueprints yet"
          hint="Create a blueprint playbook with stages first, then return here to design its state machine."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-sm flex-1">
              <SetupSelect label="Playbook" value={playbookId} onChange={(e) => setPlaybookId(e.target.value)}>
                {playbooks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SetupSelect>
            </div>
            <button
              type="button"
              onClick={() => setEditing('new')}
              disabled={stages.length < 1}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden /> Add transition
            </button>
          </div>

          {tState === 'loading' ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-outline-variant bg-surface p-12 text-sm text-on-surface-variant">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading state machine…
            </div>
          ) : tState === 'error' ? (
            <EmptyPanel title="Service unreachable" hint="The blueprint service may be starting up. Try refreshing." />
          ) : stages.length === 0 ? (
            <EmptyPanel
              title="This playbook has no stages"
              hint="Add stages to the playbook to lay out its state graph."
            />
          ) : (
            <StateGraph
              stages={stages}
              transitions={transitions}
              onSelect={(t) => setEditing(t)}
            />
          )}

          {/* Accessible transition list mirror */}
          {stages.length > 0 && transitions.length > 0 ? (
            <TransitionList
              transitions={transitions}
              stageName={stageName}
              onEdit={(t) => setEditing(t)}
              onDelete={remove}
            />
          ) : null}
        </>
      )}

      {editing ? (
        <TransitionEditor
          transition={editing === 'new' ? null : editing}
          stages={stages}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={editing === 'new' ? undefined : () => remove(editing)}
        />
      ) : null}
      {ConfirmDialog}
    </div>
  );
}

function EmptyPanel({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-12 text-center">
      <Compass className="mx-auto mb-3 h-10 w-10 text-outline" aria-hidden />
      <p className="text-sm font-medium text-on-surface-variant">{title}</p>
      <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>
    </div>
  );
}

// ─── SVG state graph ──────────────────────────────────────────────────────────

function StateGraph({
  stages,
  transitions,
  onSelect,
}: {
  stages: Stage[];
  transitions: Transition[];
  onSelect: (t: Transition) => void;
}) {
  // Layered top-to-bottom: one stage per layer, ordered by position.
  const layerOf = useMemo(() => {
    const map = new Map<string, number>();
    stages.forEach((s, i) => map.set(s.key, i));
    return map;
  }, [stages]);

  const nodeY = (key: string) => SVG_PAD + (layerOf.get(key) ?? 0) * LAYER_GAP;
  const svgH = SVG_PAD * 2 + Math.max(1, stages.length) * LAYER_GAP - (LAYER_GAP - NODE_H);

  // Build edge geometry. Forward edges bow right; backward/self bow further out.
  const edges = transitions
    .filter((t) => layerOf.has(t.fromStageId) && layerOf.has(t.toStageId))
    .map((t, idx) => {
      const fromL = layerOf.get(t.fromStageId)!;
      const toL = layerOf.get(t.toStageId)!;
      const y1 = nodeY(t.fromStageId) + NODE_H / 2;
      const y2 = nodeY(t.toStageId) + NODE_H / 2;
      const backward = toL <= fromL;
      const span = Math.abs(toL - fromL);
      // Bow amount scales with span; alternate sides a touch to reduce overlap.
      const bow = (backward ? -1 : 1) * (60 + span * 26) + (idx % 2) * 14 * (backward ? -1 : 1);
      const xEdge = backward ? CENTER_X - NODE_W / 2 : CENTER_X + NODE_W / 2;
      const cx = xEdge + bow;
      const my = (y1 + y2) / 2;
      const path = `M ${xEdge} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${xEdge} ${y2}`;
      return { t, path, labelX: cx * 0.55 + xEdge * 0.45, labelY: my, backward };
    });

  return (
    <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface p-4">
      <svg
        viewBox={`0 0 ${SVG_W} ${svgH}`}
        width="100%"
        style={{ minWidth: 420, maxWidth: SVG_W }}
        role="img"
        aria-label="Blueprint state machine diagram"
      >
        <defs>
          <marker
            id="bp-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--md-primary))" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map(({ t, path }) => (
          <path
            key={`e-${t.id}`}
            d={path}
            fill="none"
            stroke="rgb(var(--md-primary))"
            strokeWidth={1.75}
            markerEnd="url(#bp-arrow)"
            opacity={0.75}
          />
        ))}

        {/* Nodes */}
        {stages.map((s) => {
          const y = nodeY(s.key);
          return (
            <g key={s.key}>
              <rect
                x={CENTER_X - NODE_W / 2}
                y={y}
                width={NODE_W}
                height={NODE_H}
                rx={12}
                fill="rgb(var(--md-primary-container))"
                stroke="rgb(var(--md-primary) / 0.5)"
                strokeWidth={1}
              />
              <text
                x={CENTER_X}
                y={y + NODE_H / 2 + 4}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fill="rgb(var(--md-on-primary-container))"
              >
                {truncate(s.name, 22)}
              </text>
            </g>
          );
        })}

        {/* Edge labels — clickable chips open the transition editor */}
        {edges.map(({ t, labelX, labelY }) => {
          const w = Math.min(150, 22 + t.name.length * 6.6);
          return (
            <g
              key={`l-${t.id}`}
              tabIndex={0}
              role="button"
              aria-label={`Edit transition ${t.name}`}
              onClick={() => onSelect(t)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(t);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={labelX - w / 2}
                y={labelY - 11}
                width={w}
                height={22}
                rx={11}
                fill="rgb(var(--md-surface-container-high))"
                stroke="rgb(var(--md-outline-variant))"
              />
              <text
                x={labelX}
                y={labelY + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="rgb(var(--md-on-surface))"
              >
                {truncate(t.name, 18)}
                {t.slaMinutes ? ` · ${t.slaMinutes}m` : ''}
              </text>
            </g>
          );
        })}
      </svg>
      {transitions.length === 0 ? (
        <p className="mt-2 text-center text-xs text-on-surface-variant">
          No transitions yet — click “Add transition” to draw the first edge.
        </p>
      ) : null}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// ─── Accessible transition list ───────────────────────────────────────────────

function TransitionList({
  transitions,
  stageName,
  onEdit,
  onDelete,
}: {
  transitions: Transition[];
  stageName: (k: string) => string;
  onEdit: (t: Transition) => void;
  onDelete: (t: Transition) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
            <th className="px-5 py-3 text-start font-medium">Transition</th>
            <th className="px-5 py-3 text-start font-medium">From → To</th>
            <th className="px-5 py-3 text-start font-medium">Guards</th>
            <th className="px-5 py-3 text-start font-medium">SLA</th>
            <th className="w-24 px-5 py-3 text-start font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {transitions.map((t, i) => (
            <tr key={t.id} className={`border-b border-outline-variant ${i % 2 ? 'bg-surface-container-low/50' : ''}`}>
              <td className="px-5 py-3">
                <button
                  type="button"
                  onClick={() => onEdit(t)}
                  className="font-medium text-on-surface hover:text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {t.name}
                </button>
              </td>
              <td className="px-5 py-3 text-on-surface-variant">
                {stageName(t.fromStageId)} → {stageName(t.toStageId)}
              </td>
              <td className="px-5 py-3">
                {t.beforeConditions?.criteria?.length ? (
                  <Chip tone="field">{t.beforeConditions.criteria.length} guard(s)</Chip>
                ) : (
                  <span className="text-xs text-on-surface-variant">—</span>
                )}
              </td>
              <td className="px-5 py-3 text-on-surface-variant">{t.slaMinutes ? `${t.slaMinutes}m` : '—'}</td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(t)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary-container/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Edit
                  </button>
                  <IconButton icon={Trash2} label={`Delete ${t.name}`} tone="danger" onClick={() => onDelete(t)} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Transition editor drawer ─────────────────────────────────────────────────

function TransitionEditor({
  transition,
  stages,
  onClose,
  onSave,
  onDelete,
}: {
  transition: Transition | null;
  stages: Stage[];
  onClose: () => void;
  onSave: (payload: Partial<Transition>, id?: string) => Promise<boolean>;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(transition?.name ?? '');
  const [fromStageId, setFromStageId] = useState(transition?.fromStageId ?? stages[0]?.key ?? '');
  const [toStageId, setToStageId] = useState(transition?.toStageId ?? stages[1]?.key ?? stages[0]?.key ?? '');
  const [slaMinutes, setSlaMinutes] = useState<string>(
    transition?.slaMinutes != null ? String(transition.slaMinutes) : ''
  );
  const [criteria, setCriteria] = useState<Criterion[]>(transition?.beforeConditions?.criteria ?? []);
  const [allowedRoles, setAllowedRoles] = useState(
    (transition?.beforeConditions?.allowedRoles ?? []).join(', ')
  );
  const [fieldUpdates, setFieldUpdates] = useState<FieldUpdate[]>(
    transition?.afterActions?.fieldUpdates ?? []
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return notify.error('Enter a transition name');
    if (!fromStageId || !toStageId) return notify.error('Pick both a from- and to-stage');
    const roles = allowedRoles.split(',').map((r) => r.trim()).filter(Boolean);
    const cleanCriteria = criteria.filter((c) => c.type);
    const cleanUpdates = fieldUpdates.filter((f) => f.field.trim());
    const payload: Partial<Transition> = {
      name: name.trim(),
      fromStageId,
      toStageId,
      slaMinutes: slaMinutes === '' ? null : Math.max(1, Number(slaMinutes) || 0) || null,
      beforeConditions: { criteria: cleanCriteria, allowedRoles: roles },
      afterActions: { fieldUpdates: cleanUpdates },
    };
    setSaving(true);
    await onSave(payload, transition?.id);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-on-surface/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-outline-variant bg-surface shadow-modal"
      >
        <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
          <h2 className="text-lg font-semibold text-on-surface">
            {transition ? 'Edit transition' : 'New transition'}
          </h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>

        <div className="flex-1 space-y-5 px-6 py-5">
          <Field label="Transition name">
            <TextControl value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Qualify" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="From stage">
              <SelectControl value={fromStageId} onChange={(e) => setFromStageId(e.target.value)}>
                {stages.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </SelectControl>
            </Field>
            <Field label="To stage">
              <SelectControl value={toStageId} onChange={(e) => setToStageId(e.target.value)}>
                {stages.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </SelectControl>
            </Field>
          </div>

          <Field label="SLA (minutes)">
            <TextControl
              type="number"
              min={1}
              value={slaMinutes}
              onChange={(e) => setSlaMinutes(e.target.value)}
              placeholder="Optional — e.g. 1440 (24h)"
            />
          </Field>

          <Field label="Allowed roles">
            <TextControl
              value={allowedRoles}
              onChange={(e) => setAllowedRoles(e.target.value)}
              placeholder="Comma-separated, e.g. sales_manager, admin"
            />
          </Field>

          {/* Before conditions (guards) */}
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
              Before — guard conditions
            </p>
            {criteria.length === 0 ? (
              <p className="mb-2 rounded-lg border border-dashed border-outline-variant px-3 py-2 text-xs text-on-surface-variant">
                No guards — transition is allowed whenever roles match.
              </p>
            ) : (
              <div className="mb-2 space-y-2">
                {criteria.map((c, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg bg-surface-container-low/50 p-2">
                    <SelectControl
                      aria-label="Guard type"
                      value={c.type}
                      onChange={(e) =>
                        setCriteria((arr) =>
                          arr.map((x, j) => (j === i ? { ...x, type: e.target.value as Criterion['type'] } : x))
                        )
                      }
                      className="w-44"
                    >
                      {CRITERION_TYPES.map((ct) => (
                        <option key={ct.value} value={ct.value}>
                          {ct.label}
                        </option>
                      ))}
                    </SelectControl>
                    {(c.type === 'required_field' || c.type === 'min_value') && (
                      <TextControl
                        aria-label="Field"
                        value={c.field ?? ''}
                        onChange={(e) => setCriteria((arr) => arr.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}
                        placeholder="field"
                        className="w-28"
                      />
                    )}
                    {c.type === 'min_value' && (
                      <TextControl
                        aria-label="Min value"
                        type="number"
                        value={c.minValue ?? ''}
                        onChange={(e) =>
                          setCriteria((arr) => arr.map((x, j) => (j === i ? { ...x, minValue: Number(e.target.value) } : x)))
                        }
                        placeholder="min"
                        className="w-24"
                      />
                    )}
                    {c.type === 'activity_completed' && (
                      <TextControl
                        aria-label="Activity type"
                        value={c.activityType ?? ''}
                        onChange={(e) =>
                          setCriteria((arr) => arr.map((x, j) => (j === i ? { ...x, activityType: e.target.value } : x)))
                        }
                        placeholder="activity type"
                        className="w-32"
                      />
                    )}
                    <IconButton
                      icon={Trash2}
                      label="Remove guard"
                      tone="danger"
                      onClick={() => setCriteria((arr) => arr.filter((_, j) => j !== i))}
                    />
                  </div>
                ))}
              </div>
            )}
            <AddRowButton
              label="Add guard"
              onClick={() => setCriteria((arr) => [...arr, { type: 'required_field', field: '' }])}
            />
          </div>

          {/* After actions */}
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
              After — field updates
            </p>
            {fieldUpdates.length === 0 ? (
              <p className="mb-2 rounded-lg border border-dashed border-outline-variant px-3 py-2 text-xs text-on-surface-variant">
                No field updates on transition.
              </p>
            ) : (
              <div className="mb-2 space-y-2">
                {fieldUpdates.map((f, i) => (
                  <div key={i} className="flex items-end gap-2 rounded-lg bg-surface-container-low/50 p-2">
                    <TextControl
                      aria-label="Field"
                      value={f.field}
                      onChange={(e) => setFieldUpdates((arr) => arr.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}
                      placeholder="field"
                      className="flex-1"
                    />
                    <TextControl
                      aria-label="Value"
                      value={f.value}
                      onChange={(e) => setFieldUpdates((arr) => arr.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                      placeholder="value"
                      className="flex-1"
                    />
                    <IconButton
                      icon={Trash2}
                      label="Remove field update"
                      tone="danger"
                      onClick={() => setFieldUpdates((arr) => arr.filter((_, j) => j !== i))}
                    />
                  </div>
                ))}
              </div>
            )}
            <AddRowButton
              label="Add field update"
              onClick={() => setFieldUpdates((arr) => [...arr, { field: '', value: '' }])}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-outline-variant px-6 py-4">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {transition ? 'Save changes' : 'Create transition'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
