'use client';

import { useState } from 'react';
import { CopyCheck, Plus, ScanSearch, Trash2 } from 'lucide-react';
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

interface DuplicateRule {
  id: string;
  module: string;
  name: string;
  matchFields: string[];
  matchType: string;
  threshold?: number | null;
  isActive: boolean;
}
interface Cluster {
  score: number;
  recordIds: string[];
}

const MODULES = ['lead', 'contact', 'account', 'deal'];

export default function DuplicateRulesPage() {
  const { get, post, del } = useBff();
  const { rows, state, reload } = useBffList<DuplicateRule>('/bff/crm/duplicate-rules');

  const [module, setModule] = useState('account');
  const [name, setName] = useState('');
  const [fieldsText, setFieldsText] = useState('');
  const [matchType, setMatchType] = useState('EXACT');
  const [threshold, setThreshold] = useState(80);
  const [saving, setSaving] = useState(false);

  const [scanModule, setScanModule] = useState('account');
  const [clusters, setClusters] = useState<Cluster[] | null>(null);
  const [scanning, setScanning] = useState(false);

  const create = async () => {
    if (!name.trim()) return notify.error('Enter a rule name');
    const matchFields = fieldsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (matchFields.length === 0) return notify.error('Add at least one match field');
    setSaving(true);
    const res = await post('/bff/crm/duplicate-rules', {
      module,
      name: name.trim(),
      matchFields,
      matchType,
      ...(matchType === 'FUZZY' ? { threshold: Number(threshold) || 80 } : {}),
    });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to create rule', res.error);
    notify.success('Duplicate rule created');
    setName('');
    setFieldsText('');
    void reload();
  };

  const remove = async (id: string) => {
    const res = await del(`/bff/crm/duplicate-rules/${id}`);
    if (!res.ok) return notify.error('Failed to delete rule', res.error);
    notify.success('Rule deleted');
    void reload();
  };

  const findDuplicates = async () => {
    setScanning(true);
    const res = await get<{ clusters?: Cluster[] }>(`/bff/crm/duplicates?module=${scanModule}`);
    setScanning(false);
    if (!res.ok) {
      setClusters([]);
      return notify.error('Duplicate scan failed', res.error);
    }
    const found = res.data?.clusters ?? [];
    setClusters(found);
    notify.success(`Found ${found.length} duplicate cluster${found.length === 1 ? '' : 's'}`);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <SetupHeader
        icon={CopyCheck}
        title="Duplicate Rules"
        description="Define how duplicates are detected per module, then scan on demand. Rules match on the chosen fields, exactly or fuzzily."
        onRefresh={() => void reload()}
      />

      <SetupPanel title="New duplicate rule">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SetupSelect id="dr-module" label="Module" value={module} onChange={(e) => setModule(e.target.value)}>
            {MODULES.map((m) => (
              <option key={m} value={m} className="capitalize">
                {m}
              </option>
            ))}
          </SetupSelect>
          <SetupInput label="Rule name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Same email" />
          <div className="sm:col-span-2">
            <label htmlFor="dr-fields" className="mb-1 block text-sm font-medium text-on-surface">
              Match fields
            </label>
            <input
              id="dr-fields"
              value={fieldsText}
              onChange={(e) => setFieldsText(e.target.value)}
              placeholder="e.g. email, phone"
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <p className="mt-1 text-xs text-on-surface-variant">Comma-separated field names to compare.</p>
          </div>
          <SetupSelect label="Match type" value={matchType} onChange={(e) => setMatchType(e.target.value)}>
            <option value="EXACT">Exact</option>
            <option value="FUZZY">Fuzzy</option>
          </SetupSelect>
          {matchType === 'FUZZY' ? (
            <SetupInput
              label="Threshold (%)"
              type="number"
              min={1}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Number.parseInt(e.target.value, 10) || 0)}
            />
          ) : null}
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
        emptyIcon={CopyCheck}
        emptyTitle="No duplicate rules yet"
        emptyHint="Create a rule to define how duplicate records are detected."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
              <th className="px-5 py-3 text-start font-medium">Rule</th>
              <th className="px-5 py-3 text-start font-medium">Module</th>
              <th className="px-5 py-3 text-start font-medium">Match fields</th>
              <th className="px-5 py-3 text-start font-medium">Type</th>
              <th className="w-16 px-5 py-3 text-start font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'}`}>
                <td className="px-5 py-3 font-medium text-on-surface">{r.name}</td>
                <td className="px-5 py-3 capitalize text-on-surface-variant">{r.module}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {(r.matchFields ?? []).map((f) => (
                      <Pill key={f} tone="primary">
                        {f}
                      </Pill>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3 text-on-surface-variant">
                  {r.matchType}
                  {r.matchType === 'FUZZY' && r.threshold ? ` (${r.threshold}%)` : ''}
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => remove(r.id)}
                    className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Delete ${r.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SetupTableCard>

      {/* Find duplicates */}
      <section className="space-y-4 rounded-xl border border-outline-variant bg-surface p-5">
        <h2 className="text-lg font-semibold text-on-surface">Find duplicates</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <SetupSelect id="dr-scan-module" label="Scan module" value={scanModule} onChange={(e) => setScanModule(e.target.value)}>
              {MODULES.map((m) => (
                <option key={m} value={m} className="capitalize">
                  {m}
                </option>
              ))}
            </SetupSelect>
          </div>
          <PrimaryButton onClick={findDuplicates} disabled={scanning}>
            <ScanSearch className="h-4 w-4" aria-hidden /> {scanning ? 'Scanning…' : 'Scan now'}
          </PrimaryButton>
        </div>
        {clusters === null ? (
          <p className="text-sm text-on-surface-variant">Run a scan to surface potential duplicate clusters.</p>
        ) : clusters.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No duplicate clusters found for this module.</p>
        ) : (
          <ul className="space-y-2">
            {clusters.map((c, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm"
              >
                <span className="text-on-surface">{c.recordIds.length} matching records</span>
                <Pill tone="warning">score {Math.round((c.score ?? 0) * 100) / 100}</Pill>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
