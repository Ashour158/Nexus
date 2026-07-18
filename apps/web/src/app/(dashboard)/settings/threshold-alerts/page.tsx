'use client';

import { useState } from 'react';
import { BellRing, Plus, Trash2 } from 'lucide-react';
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

interface ThresholdAlert {
  id: string;
  module: string;
  name: string;
  field: string;
  operator: string;
  value: unknown;
  isActive: boolean;
}

const MODULES = ['lead', 'deal', 'account', 'contact', 'ticket'];
const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'not_contains', 'in', 'not_in'];

export default function ThresholdAlertsPage() {
  const { post, del } = useBff();
  const { rows, state, reload } = useBffList<ThresholdAlert>('/bff/workflow/threshold-alerts');

  const [module, setModule] = useState('deal');
  const [name, setName] = useState('');
  const [field, setField] = useState('');
  const [operator, setOperator] = useState('gte');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim() || !field.trim()) return notify.error('Enter a name and field');
    // Coerce numeric-looking values to numbers so gt/gte compare correctly.
    const raw = value.trim();
    const coerced: unknown = raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
    setSaving(true);
    const res = await post('/bff/workflow/threshold-alerts', {
      module,
      name: name.trim(),
      field: field.trim(),
      operator,
      value: coerced,
    });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to create alert', res.error);
    notify.success('Threshold alert created');
    setName('');
    setField('');
    setValue('');
    void reload();
  };

  const toggle = async (a: ThresholdAlert) => {
    const res = await post(`/bff/workflow/threshold-alerts/${a.id}/toggle`);
    if (!res.ok) return notify.error('Failed to toggle alert', res.error);
    void reload();
  };

  const remove = async (id: string) => {
    const res = await del(`/bff/workflow/threshold-alerts/${id}`);
    if (!res.ok) return notify.error('Failed to delete alert', res.error);
    notify.success('Alert deleted');
    void reload();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <SetupHeader
        icon={BellRing}
        title="Threshold Alerts"
        description="Notify roles or users automatically when a record field crosses a configured threshold (e.g. deal amount ≥ 100,000)."
        onRefresh={() => void reload()}
      />

      <SetupPanel title="New threshold alert">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SetupSelect label="Module" value={module} onChange={(e) => setModule(e.target.value)}>
            {MODULES.map((m) => (
              <option key={m} value={m} className="capitalize">
                {m}
              </option>
            ))}
          </SetupSelect>
          <SetupInput label="Alert name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Big deal alert" />
          <SetupInput label="Field" value={field} onChange={(e) => setField(e.target.value)} placeholder="e.g. amount" className="font-mono" />
          <SetupSelect label="Operator" value={operator} onChange={(e) => setOperator(e.target.value)}>
            {OPERATORS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </SetupSelect>
          <SetupInput label="Value" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 100000" />
        </div>
        <div className="flex justify-end">
          <PrimaryButton onClick={create} disabled={saving || !name.trim() || !field.trim()}>
            <Plus className="h-4 w-4" aria-hidden /> {saving ? 'Creating…' : 'Add alert'}
          </PrimaryButton>
        </div>
      </SetupPanel>

      <SetupTableCard
        state={state}
        isEmpty={rows.length === 0}
        emptyIcon={BellRing}
        emptyTitle="No threshold alerts yet"
        emptyHint="Add an alert to get notified when a record field crosses a threshold."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
              <th className="px-5 py-3 text-start font-medium">Alert</th>
              <th className="px-5 py-3 text-start font-medium">Module</th>
              <th className="px-5 py-3 text-start font-medium">Condition</th>
              <th className="px-5 py-3 text-center font-medium">Active</th>
              <th className="w-16 px-5 py-3 text-start font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={a.id} className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'}`}>
                <td className="px-5 py-3 font-medium text-on-surface">{a.name}</td>
                <td className="px-5 py-3 capitalize text-on-surface-variant">{a.module}</td>
                <td className="px-5 py-3 font-mono text-xs text-on-surface-variant">
                  {a.field} {a.operator} {String(a.value)}
                </td>
                <td className="px-5 py-3 text-center">
                  <ToggleSwitch checked={a.isActive} onToggle={() => toggle(a)} label={`Toggle ${a.name}`} />
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => remove(a.id)}
                    className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Delete ${a.name}`}
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
