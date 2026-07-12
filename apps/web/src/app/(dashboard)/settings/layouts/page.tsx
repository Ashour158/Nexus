'use client';

import { useEffect, useState } from 'react';
import { LayoutGrid, Plus, Trash2 } from 'lucide-react';
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
} from '@/components/settings/setup-ui';

interface PageLayout {
  id: string;
  module: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
}
interface LayoutRule {
  id: string;
  name: string;
  triggerField: string;
  operator: string;
  isActive: boolean;
}

const MODULES = ['account', 'contact', 'lead', 'deal', 'ticket'];

export default function PageLayoutsPage() {
  const { get, post, del } = useBff();
  const { rows, state, reload } = useBffList<PageLayout>('/bff/metadata/layouts');

  const [module, setModule] = useState('account');
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState<PageLayout | null>(null);
  const [layoutRules, setLayoutRules] = useState<LayoutRule[]>([]);
  const [rulesState, setRulesState] = useState<'idle' | 'loading' | 'ready'>('idle');

  useEffect(() => {
    if (!selected) return;
    setRulesState('loading');
    void get<LayoutRule[]>(`/bff/metadata/layouts/${selected.id}/rules`).then((res) => {
      setLayoutRules(Array.isArray(res.data) ? res.data : []);
      setRulesState('ready');
    });
  }, [selected, get]);

  const create = async () => {
    if (!name.trim()) return notify.error('Enter a layout name');
    setSaving(true);
    const res = await post('/bff/metadata/layouts', {
      module,
      name: name.trim(),
      isDefault,
      sections: [],
    });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to create layout', res.error);
    notify.success('Layout created');
    setName('');
    setIsDefault(false);
    void reload();
  };

  const remove = async (layout: PageLayout) => {
    const res = await del(`/bff/metadata/layouts/${layout.id}`);
    if (!res.ok) return notify.error('Failed to delete layout', res.error);
    notify.success('Layout deleted');
    if (selected?.id === layout.id) setSelected(null);
    void reload();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <SetupHeader
        icon={LayoutGrid}
        title="Page Layouts & Layout Rules"
        description="Per-module record page layouts and dynamic layout rules that show or hide sections based on field values. Select a layout to inspect its rules."
        onRefresh={() => void reload()}
      />

      <SetupPanel title="New page layout">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SetupSelect label="Module" value={module} onChange={(e) => setModule(e.target.value)}>
            {MODULES.map((m) => (
              <option key={m} value={m} className="capitalize">
                {m}
              </option>
            ))}
          </SetupSelect>
          <SetupInput
            label="Layout name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Enterprise account layout"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4 rounded border-outline-variant text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          Make this the default layout for the module
        </label>
        <div className="flex justify-end">
          <PrimaryButton onClick={create} disabled={saving || !name.trim()}>
            <Plus className="h-4 w-4" aria-hidden /> {saving ? 'Creating…' : 'Create layout'}
          </PrimaryButton>
        </div>
      </SetupPanel>

      <SetupTableCard
        state={state}
        isEmpty={rows.length === 0}
        emptyIcon={LayoutGrid}
        emptyTitle="No page layouts yet"
        emptyHint="Define a page layout for a module to control field arrangement and layout rules."
      >
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
            {rows.map((layout, i) => (
              <tr
                key={layout.id}
                onClick={() => setSelected(layout)}
                className={`cursor-pointer border-b border-outline-variant ${
                  selected?.id === layout.id ? 'bg-primary-container/40' : i % 2 === 0 ? '' : 'bg-surface-container-low/50'
                } hover:bg-primary-container/30`}
              >
                <td className="px-5 py-3 font-medium text-on-surface">{layout.name}</td>
                <td className="px-5 py-3 capitalize text-on-surface-variant">{layout.module}</td>
                <td className="px-5 py-3">{layout.isDefault ? <Pill tone="success">Default</Pill> : '—'}</td>
                <td className="px-5 py-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(layout);
                    }}
                    className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Delete ${layout.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SetupTableCard>

      {selected ? (
        <div className="rounded-xl border border-outline-variant bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-on-surface">
            Layout rules — <span className="text-primary">{selected.name}</span>
          </h3>
          {rulesState === 'loading' ? (
            <p className="text-sm text-on-surface-variant">Loading rules…</p>
          ) : layoutRules.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              This layout has no dynamic rules. Rules show or hide sections based on a trigger field.
            </p>
          ) : (
            <ul className="space-y-2">
              {layoutRules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm"
                >
                  <span className="font-medium text-on-surface">{rule.name}</span>
                  <span className="text-xs text-on-surface-variant">
                    when <code className="font-mono">{rule.triggerField}</code> {rule.operator}
                  </span>
                  <Pill tone={rule.isActive ? 'success' : 'neutral'}>{rule.isActive ? 'Active' : 'Off'}</Pill>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
