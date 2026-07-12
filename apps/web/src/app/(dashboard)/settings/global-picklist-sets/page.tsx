'use client';

import { useState } from 'react';
import { List, Plus, Trash2 } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff, useBffList } from '@/lib/use-bff';
import {
  Pill,
  PrimaryButton,
  SetupHeader,
  SetupInput,
  SetupPanel,
  SetupTableCard,
  ToggleSwitch,
} from '@/components/settings/setup-ui';

interface GlobalSet {
  id: string;
  name: string;
  options: Array<string | { value: string; label?: string }>;
  isActive: boolean;
}

function optionValues(options: GlobalSet['options']): string[] {
  if (!Array.isArray(options)) return [];
  return options.map((o) => (typeof o === 'string' ? o : o.label ?? o.value));
}

export default function GlobalPicklistSetsPage() {
  const { post, patch, del } = useBff();
  const { rows, state, reload } = useBffList<GlobalSet>('/bff/metadata/global-sets');

  const [name, setName] = useState('');
  const [optionsText, setOptionsText] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) return notify.error('Enter a set name');
    const options = optionsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (options.length === 0) return notify.error('Add at least one value');
    setSaving(true);
    const res = await post('/bff/metadata/global-sets', { name: name.trim(), options });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to create set', res.error);
    notify.success('Picklist set created');
    setName('');
    setOptionsText('');
    void reload();
  };

  const toggle = async (set: GlobalSet) => {
    const res = await patch(`/bff/metadata/global-sets/${set.id}`, { isActive: !set.isActive });
    if (!res.ok) return notify.error('Failed to update set', res.error);
    void reload();
  };

  const remove = async (id: string) => {
    const res = await del(`/bff/metadata/global-sets/${id}`);
    if (!res.ok) return notify.error('Failed to delete set', res.error);
    notify.success('Set deleted');
    void reload();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <SetupHeader
        icon={List}
        title="Global Picklist Sets"
        description="Reusable sets of picklist values shared across custom fields and modules. Update the set once and every field using it stays in sync."
        onRefresh={() => void reload()}
      />

      <SetupPanel title="New picklist set">
        <div className="grid grid-cols-1 gap-4">
          <SetupInput
            label="Set name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Deal stages"
          />
          <div>
            <label htmlFor="gps-options" className="mb-1 block text-sm font-medium text-on-surface">
              Values
            </label>
            <textarea
              id="gps-options"
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={4}
              placeholder="One value per line (or comma-separated)"
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <p className="mt-1 text-xs text-on-surface-variant">
              Enter each option on its own line, or separate them with commas.
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <PrimaryButton onClick={create} disabled={saving || !name.trim()}>
            <Plus className="h-4 w-4" aria-hidden /> {saving ? 'Creating…' : 'Create set'}
          </PrimaryButton>
        </div>
      </SetupPanel>

      <SetupTableCard
        state={state}
        isEmpty={rows.length === 0}
        emptyIcon={List}
        emptyTitle="No global picklist sets yet"
        emptyHint="Create a global picklist set to reuse the same values across multiple fields."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
              <th className="px-5 py-3 text-start font-medium">Name</th>
              <th className="px-5 py-3 text-start font-medium">Values</th>
              <th className="px-5 py-3 text-center font-medium">Active</th>
              <th className="w-16 px-5 py-3 text-start font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((set, i) => {
              const values = optionValues(set.options);
              return (
                <tr
                  key={set.id}
                  className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'}`}
                >
                  <td className="px-5 py-3 font-medium text-on-surface">{set.name}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {values.slice(0, 6).map((v, idx) => (
                        <Pill key={`${v}-${idx}`} tone="primary">
                          {v}
                        </Pill>
                      ))}
                      {values.length > 6 ? (
                        <span className="text-xs text-on-surface-variant">+{values.length - 6} more</span>
                      ) : null}
                      {values.length === 0 ? <span className="text-xs text-on-surface-variant">—</span> : null}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <ToggleSwitch
                      checked={set.isActive}
                      onToggle={() => toggle(set)}
                      label={`Toggle ${set.name}`}
                    />
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => remove(set.id)}
                      className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Delete ${set.name}`}
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
