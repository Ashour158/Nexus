'use client';

import { useState } from 'react';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff, useBffList } from '@/lib/use-bff';
import {
  PrimaryButton,
  SetupHeader,
  SetupInput,
  SetupPanel,
  SetupSelect,
  SetupTableCard,
  ToggleSwitch,
} from '@/components/settings/setup-ui';

interface EscalationTier {
  afterMinutes: number;
  action: string;
  target?: string;
}
interface EscalationRule {
  id: string;
  module: string;
  name: string;
  tiers: EscalationTier[];
  businessHoursOnly: boolean;
  isActive: boolean;
}

const MODULES = ['lead', 'deal', 'account', 'contact', 'ticket'];
const ACTIONS = [
  { value: 'NOTIFY', label: 'Notify' },
  { value: 'REASSIGN', label: 'Reassign' },
  { value: 'SET_FIELD', label: 'Set field' },
  { value: 'CREATE_TASK', label: 'Create task' },
];

export default function EscalationRulesPage() {
  const { post, del } = useBff();
  const { rows, state, reload } = useBffList<EscalationRule>('/bff/workflow/escalation-rules');

  const [module, setModule] = useState('lead');
  const [name, setName] = useState('');
  const [afterMinutes, setAfterMinutes] = useState(60);
  const [action, setAction] = useState('NOTIFY');
  const [target, setTarget] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) return notify.error('Enter a rule name');
    setSaving(true);
    const res = await post('/bff/workflow/escalation-rules', {
      module,
      name: name.trim(),
      tiers: [{ afterMinutes: Number(afterMinutes) || 0, action, ...(target.trim() ? { target: target.trim() } : {}) }],
    });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to create rule', res.error);
    notify.success('Escalation rule created');
    setName('');
    setTarget('');
    void reload();
  };

  const toggle = async (rule: EscalationRule) => {
    const res = await post(`/bff/workflow/escalation-rules/${rule.id}/toggle`);
    if (!res.ok) return notify.error('Failed to toggle rule', res.error);
    void reload();
  };

  const remove = async (id: string) => {
    const res = await del(`/bff/workflow/escalation-rules/${id}`);
    if (!res.ok) return notify.error('Failed to delete rule', res.error);
    notify.success('Rule deleted');
    void reload();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <SetupHeader
        icon={Clock}
        title="Escalation Rules"
        description="Escalate records and SLAs to managers when they breach time-based thresholds. Each rule fires a tiered action after the configured delay."
        onRefresh={() => void reload()}
      />

      <SetupPanel title="New escalation rule">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SetupSelect label="Module" value={module} onChange={(e) => setModule(e.target.value)}>
            {MODULES.map((m) => (
              <option key={m} value={m} className="capitalize">
                {m}
              </option>
            ))}
          </SetupSelect>
          <SetupInput
            label="Rule name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Stale lead escalation"
          />
          <SetupInput
            label="After (minutes)"
            type="number"
            min={0}
            value={afterMinutes}
            onChange={(e) => setAfterMinutes(Number.parseInt(e.target.value, 10) || 0)}
            hint="Delay before this tier fires."
          />
          <SetupSelect label="Action" value={action} onChange={(e) => setAction(e.target.value)}>
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </SetupSelect>
          <SetupInput
            label="Target (optional)"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="user id, role, or field"
            hint="Who/what the action applies to (reassign target, field name, …)."
          />
        </div>
        <div className="flex justify-end">
          <PrimaryButton onClick={create} disabled={saving || !name.trim()}>
            <Plus className="h-4 w-4" aria-hidden /> {saving ? 'Creating…' : 'Add rule'}
          </PrimaryButton>
        </div>
      </SetupPanel>

      <SetupTableCard
        state={state}
        isEmpty={rows.length === 0}
        emptyIcon={Clock}
        emptyTitle="No escalation rules yet"
        emptyHint="Add an escalation rule to notify or reassign records that miss their SLA."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
              <th className="px-5 py-3 text-start font-medium">Rule</th>
              <th className="px-5 py-3 text-start font-medium">Module</th>
              <th className="px-5 py-3 text-start font-medium">Tiers</th>
              <th className="px-5 py-3 text-center font-medium">Active</th>
              <th className="w-16 px-5 py-3 text-start font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((rule, i) => (
              <tr
                key={rule.id}
                className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'}`}
              >
                <td className="px-5 py-3 font-medium text-on-surface">{rule.name}</td>
                <td className="px-5 py-3 capitalize text-on-surface-variant">{rule.module}</td>
                <td className="px-5 py-3 text-on-surface-variant">
                  {Array.isArray(rule.tiers)
                    ? rule.tiers
                        .map((t) => `${t.afterMinutes}m → ${t.action}`)
                        .join(', ') || '—'
                    : '—'}
                </td>
                <td className="px-5 py-3 text-center">
                  <ToggleSwitch
                    checked={rule.isActive}
                    onToggle={() => toggle(rule)}
                    label={`Toggle ${rule.name}`}
                  />
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => remove(rule.id)}
                    className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Delete ${rule.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SetupTableCard>
    </div>
  );
}
