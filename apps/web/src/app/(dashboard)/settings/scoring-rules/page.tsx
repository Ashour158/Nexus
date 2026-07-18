'use client';

import { useState } from 'react';
import { Plus, Target, Trash2 } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff, useBffList } from '@/lib/use-bff';
import {
  Pill,
  PrimaryButton,
  SetupHeader,
  SetupInput,
  SetupPanel,
  SetupSelect,
  SetupTableCard,
  ToggleSwitch,
} from '@/components/settings/setup-ui';

interface ScoringCondition {
  field: string;
  operator: string;
  value?: unknown;
  points: number;
}
interface ScoringRule {
  id: string;
  module: string;
  name: string;
  conditions: ScoringCondition[];
  isActive: boolean;
}

const MODULES = ['lead', 'deal', 'contact', 'account'];
const OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'exists',
  'not_exists',
];

export default function ScoringRulesPage() {
  const { post, del } = useBff();
  const { rows, state, reload } = useBffList<ScoringRule>('/bff/workflow/scoring-rules');

  const [module, setModule] = useState('lead');
  const [name, setName] = useState('');
  const [field, setField] = useState('');
  const [operator, setOperator] = useState('eq');
  const [value, setValue] = useState('');
  const [points, setPoints] = useState(10);
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim() || !field.trim()) return notify.error('Enter a name and field');
    const raw = value.trim();
    const coerced: unknown = raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
    setSaving(true);
    const res = await post('/bff/workflow/scoring-rules', {
      module,
      name: name.trim(),
      conditions: [{ field: field.trim(), operator, value: coerced, points: Number(points) || 0 }],
    });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to create rule', res.error);
    notify.success('Scoring rule created');
    setName('');
    setField('');
    setValue('');
    void reload();
  };

  const toggle = async (rule: ScoringRule) => {
    const res = await post(`/bff/workflow/scoring-rules/${rule.id}/toggle`);
    if (!res.ok) return notify.error('Failed to toggle rule', res.error);
    void reload();
  };

  const remove = async (id: string) => {
    const res = await del(`/bff/workflow/scoring-rules/${id}`);
    if (!res.ok) return notify.error('Failed to delete rule', res.error);
    notify.success('Rule deleted');
    void reload();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <SetupHeader
        icon={Target}
        title="Scoring Rules"
        description="Deterministic record scoring. Each rule adds (or subtracts) points when its condition matches, driving lead and deal prioritization."
        onRefresh={() => void reload()}
      />

      <SetupPanel title="New scoring rule">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SetupSelect label="Module" value={module} onChange={(e) => setModule(e.target.value)}>
            {MODULES.map((m) => (
              <option key={m} value={m} className="capitalize">
                {m}
              </option>
            ))}
          </SetupSelect>
          <SetupInput label="Rule name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Enterprise size" />
          <SetupInput label="Field" value={field} onChange={(e) => setField(e.target.value)} placeholder="e.g. companySize" className="font-mono" />
          <SetupSelect label="Operator" value={operator} onChange={(e) => setOperator(e.target.value)}>
            {OPERATORS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </SetupSelect>
          <SetupInput label="Value" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. enterprise" />
          <SetupInput
            label="Points"
            type="number"
            value={points}
            onChange={(e) => setPoints(Number.parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div className="flex justify-end">
          <PrimaryButton onClick={create} disabled={saving || !name.trim() || !field.trim()}>
            <Plus className="h-4 w-4" aria-hidden /> {saving ? 'Creating…' : 'Add rule'}
          </PrimaryButton>
        </div>
      </SetupPanel>

      <SetupTableCard
        state={state}
        isEmpty={rows.length === 0}
        emptyIcon={Target}
        emptyTitle="No scoring rules yet"
        emptyHint="Create a scoring rule to award points when a record matches your criteria."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
              <th className="px-5 py-3 text-start font-medium">Rule</th>
              <th className="px-5 py-3 text-start font-medium">Module</th>
              <th className="px-5 py-3 text-start font-medium">Conditions</th>
              <th className="px-5 py-3 text-end font-medium">Points</th>
              <th className="px-5 py-3 text-center font-medium">Active</th>
              <th className="w-16 px-5 py-3 text-start font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((rule, i) => {
              const totalPoints = Array.isArray(rule.conditions)
                ? rule.conditions.reduce((sum, c) => sum + (Number(c.points) || 0), 0)
                : 0;
              return (
                <tr key={rule.id} className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'}`}>
                  <td className="px-5 py-3 font-medium text-on-surface">{rule.name}</td>
                  <td className="px-5 py-3 capitalize text-on-surface-variant">{rule.module}</td>
                  <td className="px-5 py-3">
                    <Pill tone="primary">
                      {Array.isArray(rule.conditions) ? rule.conditions.length : 0} condition
                      {(rule.conditions?.length ?? 0) === 1 ? '' : 's'}
                    </Pill>
                  </td>
                  <td className="px-5 py-3 text-end font-bold text-on-surface">{totalPoints}</td>
                  <td className="px-5 py-3 text-center">
                    <ToggleSwitch checked={rule.isActive} onToggle={() => toggle(rule)} label={`Toggle ${rule.name}`} />
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
              );
            })}
          </tbody>
        </table>
      </SetupTableCard>
    </div>
  );
}
