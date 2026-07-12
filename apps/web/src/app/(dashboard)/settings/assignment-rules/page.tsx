'use client';

import { useState } from 'react';
import { Plus, Route, Trash2 } from 'lucide-react';
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

interface AssignmentRule {
  id: string;
  module: string;
  name: string;
  strategy: string;
  assigneePool: string[];
  isActive: boolean;
}

interface UserRef {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

const MODULES = ['lead', 'deal', 'account', 'contact'] as const;
const STRATEGIES = [
  { value: 'ROUND_ROBIN', label: 'Round robin' },
  { value: 'LOAD_BALANCED', label: 'Load balanced' },
  { value: 'CRITERIA', label: 'Criteria based' },
];

function userLabel(u: UserRef): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return name || u.email || u.id;
}

export default function AssignmentRulesPage() {
  const { post, patch, del } = useBff();
  const { rows, state, reload } = useBffList<AssignmentRule>('/bff/crm/assignment-rules');
  const { rows: users } = useBffList<UserRef>('/bff/auth/users');

  const [module, setModule] = useState<string>('lead');
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState('ROUND_ROBIN');
  const [pool, setPool] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const togglePool = (id: string) =>
    setPool((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const create = async () => {
    if (!name.trim()) return notify.error('Enter a rule name');
    if (pool.length === 0) return notify.error('Select at least one assignee');
    setSaving(true);
    const res = await post('/bff/crm/assignment-rules', {
      module,
      name: name.trim(),
      strategy,
      assigneePool: pool,
    });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to create rule', res.error);
    notify.success('Assignment rule created');
    setName('');
    setPool([]);
    void reload();
  };

  const toggle = async (rule: AssignmentRule) => {
    const res = await patch(`/bff/crm/assignment-rules/${rule.id}`, { isActive: !rule.isActive });
    if (!res.ok) return notify.error('Failed to update rule', res.error);
    void reload();
  };

  const remove = async (id: string) => {
    const res = await del(`/bff/crm/assignment-rules/${id}`);
    if (!res.ok) return notify.error('Failed to delete rule', res.error);
    notify.success('Rule deleted');
    void reload();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <SetupHeader
        icon={Route}
        title="Assignment Rules"
        description="Automatically route incoming leads and records to owners using round-robin, load-balanced, or criteria-based rules."
        onRefresh={() => void reload()}
      />

      <SetupPanel title="New assignment rule">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            placeholder="e.g. Enterprise round-robin"
          />
          <SetupSelect label="Strategy" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </SetupSelect>
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium text-on-surface">Assignee pool</span>
          <div className="flex flex-wrap gap-2 rounded-lg border border-outline-variant bg-surface p-2">
            {users.length === 0 ? (
              <span className="px-1 text-xs text-on-surface-variant">No users available</span>
            ) : (
              users.map((u) => {
                const active = pool.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => togglePool(u.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      active
                        ? 'bg-primary text-on-primary'
                        : 'border border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-low'
                    }`}
                  >
                    {userLabel(u)}
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <PrimaryButton onClick={create} disabled={saving || !name.trim() || pool.length === 0}>
            <Plus className="h-4 w-4" aria-hidden /> {saving ? 'Creating…' : 'Add rule'}
          </PrimaryButton>
        </div>
      </SetupPanel>

      <SetupTableCard
        state={state}
        isEmpty={rows.length === 0}
        emptyIcon={Route}
        emptyTitle="No assignment rules yet"
        emptyHint="Create an assignment rule to auto-distribute new records across your team."
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
              <th className="px-5 py-3 text-start font-medium">Rule</th>
              <th className="px-5 py-3 text-start font-medium">Module</th>
              <th className="px-5 py-3 text-start font-medium">Strategy</th>
              <th className="px-5 py-3 text-start font-medium">Assignees</th>
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
                  {STRATEGIES.find((s) => s.value === rule.strategy)?.label ?? rule.strategy}
                </td>
                <td className="px-5 py-3 text-on-surface-variant">
                  {Array.isArray(rule.assigneePool) ? rule.assigneePool.length : 0}
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
