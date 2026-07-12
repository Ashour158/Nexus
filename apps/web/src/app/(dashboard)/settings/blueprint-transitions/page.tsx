'use client';

import { useEffect, useState } from 'react';
import { Compass, Plus, Trash2 } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff, useBffList } from '@/lib/use-bff';
import {
  PrimaryButton,
  SetupHeader,
  SetupInput,
  SetupPanel,
  SetupSelect,
  SetupTableCard,
} from '@/components/settings/setup-ui';

interface Playbook {
  id: string;
  name: string;
}
interface Stage {
  id: string;
  name: string;
}
interface Transition {
  id: string;
  name: string;
  fromStageId: string;
  toStageId: string;
  slaMinutes?: number | null;
}

export default function BlueprintTransitionsPage() {
  const { get, post, del } = useBff();
  const { rows: playbooks, state: pbState, reload: reloadPlaybooks } =
    useBffList<Playbook>('/bff/blueprint/blueprints/playbooks');

  const [playbookId, setPlaybookId] = useState('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [tState, setTState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const [name, setName] = useState('');
  const [fromStageId, setFromStageId] = useState('');
  const [toStageId, setToStageId] = useState('');
  const [saving, setSaving] = useState(false);

  // Default the selection to the first playbook once loaded.
  useEffect(() => {
    if (!playbookId && playbooks.length > 0) setPlaybookId(playbooks[0].id);
  }, [playbooks, playbookId]);

  const loadTransitions = async (id: string) => {
    setTState('loading');
    const [detail, trans] = await Promise.all([
      get<{ stages?: Stage[] }>(`/bff/blueprint/blueprints/playbooks/${id}`),
      get<Transition[]>(`/bff/blueprint/blueprints/playbooks/${id}/transitions`),
    ]);
    setStages(Array.isArray(detail.data?.stages) ? detail.data!.stages! : []);
    setTransitions(Array.isArray(trans.data) ? trans.data : []);
    setTState(trans.status === 0 ? 'error' : 'ready');
  };

  useEffect(() => {
    if (playbookId) void loadTransitions(playbookId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbookId]);

  const stageName = (id: string) => stages.find((s) => s.id === id)?.name ?? id;

  const create = async () => {
    if (!name.trim()) return notify.error('Enter a transition name');
    if (!fromStageId || !toStageId) return notify.error('Pick both a from- and to-stage');
    setSaving(true);
    const res = await post(`/bff/blueprint/blueprints/playbooks/${playbookId}/transitions`, {
      name: name.trim(),
      fromStageId,
      toStageId,
    });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to create transition', res.error);
    notify.success('Transition created');
    setName('');
    setFromStageId('');
    setToStageId('');
    void loadTransitions(playbookId);
  };

  const remove = async (id: string) => {
    const res = await del(`/bff/blueprint/blueprints/playbooks/${playbookId}/transitions/${id}`);
    if (!res.ok) return notify.error('Failed to delete transition', res.error);
    notify.success('Transition deleted');
    void loadTransitions(playbookId);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <SetupHeader
        icon={Compass}
        title="Blueprint Transitions"
        description="State-machine transitions that gate record progression between stages. Pick a playbook, then define the allowed moves."
        onRefresh={() => void reloadPlaybooks()}
      />

      {pbState === 'ready' && playbooks.length === 0 ? (
        <div className="rounded-xl border border-outline-variant bg-surface p-12 text-center">
          <Compass className="mx-auto mb-3 h-10 w-10 text-outline" aria-hidden />
          <p className="text-sm font-medium text-on-surface-variant">No blueprints yet</p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Create a blueprint playbook first, then return here to define its transitions.
          </p>
        </div>
      ) : (
        <>
          <div className="max-w-sm">
            <SetupSelect
              label="Playbook"
              value={playbookId}
              onChange={(e) => setPlaybookId(e.target.value)}
            >
              {playbooks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SetupSelect>
          </div>

          <SetupPanel title="New transition">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SetupInput
                label="Transition name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Qualify"
              />
              <SetupSelect label="From stage" value={fromStageId} onChange={(e) => setFromStageId(e.target.value)}>
                <option value="">Select…</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SetupSelect>
              <SetupSelect label="To stage" value={toStageId} onChange={(e) => setToStageId(e.target.value)}>
                <option value="">Select…</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SetupSelect>
            </div>
            {stages.length === 0 ? (
              <p className="text-xs text-on-surface-variant">
                This playbook has no stages yet — add stages to the playbook to define transitions.
              </p>
            ) : null}
            <div className="flex justify-end">
              <PrimaryButton onClick={create} disabled={saving || stages.length === 0 || !name.trim()}>
                <Plus className="h-4 w-4" aria-hidden /> {saving ? 'Creating…' : 'Add transition'}
              </PrimaryButton>
            </div>
          </SetupPanel>

          <SetupTableCard
            state={tState === 'idle' ? 'loading' : tState}
            isEmpty={transitions.length === 0}
            emptyIcon={Compass}
            emptyTitle="No transitions yet"
            emptyHint="Define a transition to control the allowed moves between record stages."
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
                  <th className="px-5 py-3 text-start font-medium">Transition</th>
                  <th className="px-5 py-3 text-start font-medium">From</th>
                  <th className="px-5 py-3 text-start font-medium">To</th>
                  <th className="px-5 py-3 text-start font-medium">SLA</th>
                  <th className="w-16 px-5 py-3 text-start font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transitions.map((t, i) => (
                  <tr
                    key={t.id}
                    className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'}`}
                  >
                    <td className="px-5 py-3 font-medium text-on-surface">{t.name}</td>
                    <td className="px-5 py-3 text-on-surface-variant">{stageName(t.fromStageId)}</td>
                    <td className="px-5 py-3 text-on-surface-variant">{stageName(t.toStageId)}</td>
                    <td className="px-5 py-3 text-on-surface-variant">
                      {t.slaMinutes ? `${t.slaMinutes}m` : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => remove(t.id)}
                        className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`Delete ${t.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SetupTableCard>
        </>
      )}
    </div>
  );
}
