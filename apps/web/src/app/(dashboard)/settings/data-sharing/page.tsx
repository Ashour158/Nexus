'use client';

import { useState } from 'react';
import { Plus, Share2, Trash2 } from 'lucide-react';
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

interface OrgDefault {
  id: string;
  module: string;
  accessLevel: string;
  grantHierarchyAccess: boolean;
}
interface SharingRule {
  id: string;
  module: string;
  name: string;
  sourceType: string;
  sourceValue: string;
  targetType: string;
  targetValue: string;
  accessLevel: string;
}

const MODULES = ['account', 'contact', 'deal', 'lead'];
const OWD_LEVELS = ['PRIVATE', 'PUBLIC_READ', 'PUBLIC_READ_WRITE'];
const RULE_LEVELS = ['READ', 'READ_WRITE'];
const PARTY_TYPES = ['ROLE', 'GROUP', 'TERRITORY', 'OWNER', 'USER'];

export default function DataSharingPage() {
  const { post, del } = useBff();
  const owd = useBffList<OrgDefault>('/bff/crm/sharing/org-defaults');
  const rules = useBffList<SharingRule>('/bff/crm/sharing/rules');

  const [oModule, setOModule] = useState('account');
  const [oLevel, setOLevel] = useState('PRIVATE');
  const [oHierarchy, setOHierarchy] = useState(true);
  const [savingOwd, setSavingOwd] = useState(false);

  const [rModule, setRModule] = useState('account');
  const [rName, setRName] = useState('');
  const [rSourceType, setRSourceType] = useState('ROLE');
  const [rSourceValue, setRSourceValue] = useState('');
  const [rTargetType, setRTargetType] = useState('ROLE');
  const [rTargetValue, setRTargetValue] = useState('');
  const [rLevel, setRLevel] = useState('READ');
  const [savingRule, setSavingRule] = useState(false);

  const saveOwd = async () => {
    setSavingOwd(true);
    const res = await post('/bff/crm/sharing/org-defaults', {
      module: oModule,
      accessLevel: oLevel,
      grantHierarchyAccess: oHierarchy,
    });
    setSavingOwd(false);
    if (!res.ok) return notify.error('Failed to save default', res.error);
    notify.success('Org-wide default saved');
    void owd.reload();
  };

  const removeOwd = async (id: string) => {
    const res = await del(`/bff/crm/sharing/org-defaults/${id}`);
    if (!res.ok) return notify.error('Failed to delete default', res.error);
    void owd.reload();
  };

  const saveRule = async () => {
    if (!rName.trim() || !rSourceValue.trim() || !rTargetValue.trim())
      return notify.error('Name, source and target are required');
    setSavingRule(true);
    const res = await post('/bff/crm/sharing/rules', {
      module: rModule,
      name: rName.trim(),
      sourceType: rSourceType,
      sourceValue: rSourceValue.trim(),
      targetType: rTargetType,
      targetValue: rTargetValue.trim(),
      accessLevel: rLevel,
    });
    setSavingRule(false);
    if (!res.ok) return notify.error('Failed to create rule', res.error);
    notify.success('Sharing rule created');
    setRName('');
    setRSourceValue('');
    setRTargetValue('');
    void rules.reload();
  };

  const removeRule = async (id: string) => {
    const res = await del(`/bff/crm/sharing/rules/${id}`);
    if (!res.ok) return notify.error('Failed to delete rule', res.error);
    void rules.reload();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <SetupHeader
        icon={Share2}
        title="Data Sharing"
        description="Set org-wide default record visibility per module, then open access selectively with sharing rules. A module with no default is unrestricted."
        onRefresh={() => {
          void owd.reload();
          void rules.reload();
        }}
      />

      {/* Org-wide defaults */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-on-surface">Org-wide defaults</h2>
        <SetupPanel title="Set default access for a module">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SetupSelect id="owd-module" label="Module" value={oModule} onChange={(e) => setOModule(e.target.value)}>
              {MODULES.map((m) => (
                <option key={m} value={m} className="capitalize">
                  {m}
                </option>
              ))}
            </SetupSelect>
            <SetupSelect id="owd-access" label="Access level" value={oLevel} onChange={(e) => setOLevel(e.target.value)}>
              {OWD_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l.replace(/_/g, ' ')}
                </option>
              ))}
            </SetupSelect>
          </div>
          <label className="flex items-center gap-2 text-sm text-on-surface">
            <input
              type="checkbox"
              checked={oHierarchy}
              onChange={(e) => setOHierarchy(e.target.checked)}
              className="h-4 w-4 rounded border-outline-variant text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            Grant managers access to records owned by their reports (role hierarchy)
          </label>
          <div className="flex justify-end">
            <PrimaryButton onClick={saveOwd} disabled={savingOwd}>
              <Plus className="h-4 w-4" aria-hidden /> {savingOwd ? 'Saving…' : 'Save default'}
            </PrimaryButton>
          </div>
        </SetupPanel>

        <SetupTableCard
          state={owd.state}
          isEmpty={owd.rows.length === 0}
          emptyIcon={Share2}
          emptyTitle="No org-wide defaults set"
          emptyHint="Without a default, records in a module are visible per the base RBAC rules."
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
                <th className="px-5 py-3 text-start font-medium">Module</th>
                <th className="px-5 py-3 text-start font-medium">Access</th>
                <th className="px-5 py-3 text-start font-medium">Hierarchy</th>
                <th className="w-16 px-5 py-3 text-start font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {owd.rows.map((d, i) => (
                <tr key={d.id} className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'}`}>
                  <td className="px-5 py-3 font-medium capitalize text-on-surface">{d.module}</td>
                  <td className="px-5 py-3">
                    <Pill tone={d.accessLevel === 'PRIVATE' ? 'warning' : 'primary'}>{d.accessLevel.replace(/_/g, ' ')}</Pill>
                  </td>
                  <td className="px-5 py-3 text-on-surface-variant">{d.grantHierarchyAccess ? 'Yes' : 'No'}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => removeOwd(d.id)}
                      className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Delete ${d.module} default`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SetupTableCard>
      </section>

      {/* Sharing rules */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-on-surface">Sharing rules</h2>
        <SetupPanel title="New sharing rule">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SetupSelect id="rule-module" label="Module" value={rModule} onChange={(e) => setRModule(e.target.value)}>
              {MODULES.map((m) => (
                <option key={m} value={m} className="capitalize">
                  {m}
                </option>
              ))}
            </SetupSelect>
            <SetupInput label="Rule name" value={rName} onChange={(e) => setRName(e.target.value)} placeholder="e.g. Share EMEA with support" />
            <SetupSelect label="Share from (type)" value={rSourceType} onChange={(e) => setRSourceType(e.target.value)}>
              {PARTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SetupSelect>
            <SetupInput label="Share from (value)" value={rSourceValue} onChange={(e) => setRSourceValue(e.target.value)} placeholder="role / group / user id" />
            <SetupSelect label="Share with (type)" value={rTargetType} onChange={(e) => setRTargetType(e.target.value)}>
              {PARTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SetupSelect>
            <SetupInput label="Share with (value)" value={rTargetValue} onChange={(e) => setRTargetValue(e.target.value)} placeholder="role / group / user id" />
            <SetupSelect label="Access level" value={rLevel} onChange={(e) => setRLevel(e.target.value)}>
              {RULE_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l.replace(/_/g, ' ')}
                </option>
              ))}
            </SetupSelect>
          </div>
          <div className="flex justify-end">
            <PrimaryButton onClick={saveRule} disabled={savingRule || !rName.trim()}>
              <Plus className="h-4 w-4" aria-hidden /> {savingRule ? 'Creating…' : 'Add rule'}
            </PrimaryButton>
          </div>
        </SetupPanel>

        <SetupTableCard
          state={rules.state}
          isEmpty={rules.rows.length === 0}
          emptyIcon={Share2}
          emptyTitle="No sharing rules yet"
          emptyHint="Add a sharing rule to grant extra access on top of the org-wide default."
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
                <th className="px-5 py-3 text-start font-medium">Rule</th>
                <th className="px-5 py-3 text-start font-medium">Module</th>
                <th className="px-5 py-3 text-start font-medium">From → With</th>
                <th className="px-5 py-3 text-start font-medium">Access</th>
                <th className="w-16 px-5 py-3 text-start font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.rows.map((r, i) => (
                <tr key={r.id} className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'}`}>
                  <td className="px-5 py-3 font-medium text-on-surface">{r.name}</td>
                  <td className="px-5 py-3 capitalize text-on-surface-variant">{r.module}</td>
                  <td className="px-5 py-3 text-xs text-on-surface-variant">
                    {r.sourceType}:{r.sourceValue} → {r.targetType}:{r.targetValue}
                  </td>
                  <td className="px-5 py-3">
                    <Pill tone="primary">{r.accessLevel.replace(/_/g, ' ')}</Pill>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => removeRule(r.id)}
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
      </section>
    </div>
  );
}
