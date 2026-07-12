'use client';

import { useState } from 'react';
import { Columns3, Plus, Trash2 } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff, useBffList } from '@/lib/use-bff';
import {
  Pill,
  PrimaryButton,
  SetupHeader,
  SetupInput,
  SetupPanel,
  SetupTableCard,
} from '@/components/settings/setup-ui';

interface Mapping {
  sourceColumn: string;
  targetField: string;
  transform?: string;
}
interface MappingTemplate {
  id: string;
  name: string;
  module: string;
  mappings: Mapping[];
}

/** Parse "sourceColumn -> targetField" lines into a mappings array. */
function parseMappings(text: string): Mapping[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [source, target] = line.split(/->|=>|:/).map((s) => s.trim());
      return { sourceColumn: source ?? '', targetField: target ?? source ?? '' };
    })
    .filter((m) => m.sourceColumn && m.targetField);
}

export default function MappingTemplatesPage() {
  const { post, del } = useBff();
  const { rows, state, reload } = useBffList<MappingTemplate>('/bff/data/import/mapping-templates');

  const [name, setName] = useState('');
  const [module, setModule] = useState('account');
  const [mappingsText, setMappingsText] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) return notify.error('Enter a template name');
    const mappings = parseMappings(mappingsText);
    if (mappings.length === 0) return notify.error('Add at least one column mapping');
    setSaving(true);
    const res = await post('/bff/data/import/mapping-templates', {
      name: name.trim(),
      module: module.trim(),
      mappings,
    });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to create template', res.error);
    notify.success('Mapping template created');
    setName('');
    setMappingsText('');
    void reload();
  };

  const remove = async (id: string) => {
    const res = await del(`/bff/data/import/mapping-templates/${id}`);
    if (!res.ok) return notify.error('Failed to delete template', res.error);
    notify.success('Template deleted');
    void reload();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <SetupHeader
        icon={Columns3}
        title="Mapping Templates"
        description="Reusable column-to-field mappings for CSV imports. Save a mapping once and re-apply it on every import of the same file shape."
        onRefresh={() => void reload()}
      />

      <SetupPanel title="New mapping template">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SetupInput label="Template name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Salesforce accounts" />
          <SetupInput label="Module" value={module} onChange={(e) => setModule(e.target.value)} placeholder="e.g. account" className="font-mono" />
        </div>
        <div>
          <label htmlFor="mt-mappings" className="mb-1 block text-sm font-medium text-on-surface">
            Column mappings
          </label>
          <textarea
            id="mt-mappings"
            value={mappingsText}
            onChange={(e) => setMappingsText(e.target.value)}
            rows={5}
            placeholder={'Company Name -> name\nWebsite -> website\nAnnual Revenue -> annualRevenue'}
            className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <p className="mt-1 text-xs text-on-surface-variant">
            One mapping per line as <code className="font-mono">Source Column -&gt; targetField</code>.
          </p>
        </div>
        <div className="flex justify-end">
          <PrimaryButton onClick={create} disabled={saving || !name.trim()}>
            <Plus className="h-4 w-4" aria-hidden /> {saving ? 'Creating…' : 'Create template'}
          </PrimaryButton>
        </div>
      </SetupPanel>

      <SetupTableCard
        state={state}
        isEmpty={rows.length === 0}
        emptyIcon={Columns3}
        emptyTitle="No mapping templates yet"
        emptyHint="Create a mapping template to speed up repeat CSV imports."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
              <th className="px-5 py-3 text-start font-medium">Template</th>
              <th className="px-5 py-3 text-start font-medium">Module</th>
              <th className="px-5 py-3 text-start font-medium">Mappings</th>
              <th className="w-16 px-5 py-3 text-start font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tpl, i) => (
              <tr key={tpl.id} className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'}`}>
                <td className="px-5 py-3 font-medium text-on-surface">{tpl.name}</td>
                <td className="px-5 py-3 text-on-surface-variant">{tpl.module}</td>
                <td className="px-5 py-3">
                  <Pill tone="primary">{Array.isArray(tpl.mappings) ? tpl.mappings.length : 0} columns</Pill>
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => remove(tpl.id)}
                    className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Delete ${tpl.name}`}
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
