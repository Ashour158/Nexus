'use client';

import { useState } from 'react';
import { Check, GitPullRequest, Plus, Trash2, X } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useBff, useBffList } from '@/lib/use-bff';
import {
  Pill,
  PrimaryButton,
  SetupHeader,
  SetupPanel,
  SetupSelect,
  SetupTableCard,
} from '@/components/settings/setup-ui';

interface ReviewConfig {
  id: string;
  module: string;
  fields: string[];
  isActive: boolean;
}
interface PendingChange {
  id: string;
  module: string;
  recordId: string;
  status: string;
  changes: Record<string, unknown>;
  createdAt: string;
}

const MODULES = ['account', 'contact', 'deal'];
type Tab = 'config' | 'pending';

export default function ReviewProcessPage() {
  const { post, del } = useBff();
  const [tab, setTab] = useState<Tab>('config');

  const configList = useBffList<ReviewConfig>('/bff/crm/review/config');
  const pendingList = useBffList<PendingChange>('/bff/crm/review/pending');

  const [module, setModule] = useState('account');
  const [fieldsText, setFieldsText] = useState('');
  const [saving, setSaving] = useState(false);

  const saveConfig = async () => {
    const fields = fieldsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (fields.length === 0) return notify.error('Add at least one gated field');
    setSaving(true);
    const res = await post('/bff/crm/review/config', { module, fields, isActive: true });
    setSaving(false);
    if (!res.ok) return notify.error('Failed to save config', res.error);
    notify.success('Review process saved');
    setFieldsText('');
    void configList.reload();
  };

  const removeConfig = async (id: string) => {
    const res = await del(`/bff/crm/review/config/${id}`);
    if (!res.ok) return notify.error('Failed to delete config', res.error);
    notify.success('Config removed');
    void configList.reload();
  };

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    const res = await post(`/bff/crm/review/${id}/${decision}`, {});
    if (!res.ok) return notify.error(`Failed to ${decision}`, res.error);
    notify.success(decision === 'approve' ? 'Change approved' : 'Change rejected');
    void pendingList.reload();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <SetupHeader
        icon={GitPullRequest}
        title="Review Process"
        description="Maker-checker review configuration. Queue edits to gated fields for approval before they go live."
        onRefresh={() => (tab === 'config' ? void configList.reload() : void pendingList.reload())}
      />

      <div className="flex w-fit overflow-hidden rounded-lg border border-outline-variant" role="tablist" aria-label="Review process views">
        {(['config', 'pending'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              tab === t ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            {t === 'config' ? 'Configuration' : 'Pending changes'}
          </button>
        ))}
      </div>

      {tab === 'config' ? (
        <>
          <SetupPanel title="Gate a module for review">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SetupSelect label="Module" value={module} onChange={(e) => setModule(e.target.value)}>
                {MODULES.map((m) => (
                  <option key={m} value={m} className="capitalize">
                    {m}
                  </option>
                ))}
              </SetupSelect>
              <div>
                <label htmlFor="rp-fields" className="mb-1 block text-sm font-medium text-on-surface">
                  Review-gated fields
                </label>
                <input
                  id="rp-fields"
                  value={fieldsText}
                  onChange={(e) => setFieldsText(e.target.value)}
                  placeholder="e.g. amount, stageId"
                  className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <p className="mt-1 text-xs text-on-surface-variant">
                  Comma-separated API field names. Edits to these route through a reviewer.
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <PrimaryButton onClick={saveConfig} disabled={saving}>
                <Plus className="h-4 w-4" aria-hidden /> {saving ? 'Saving…' : 'Save config'}
              </PrimaryButton>
            </div>
          </SetupPanel>

          <SetupTableCard
            state={configList.state}
            isEmpty={configList.rows.length === 0}
            emptyIcon={GitPullRequest}
            emptyTitle="No review processes configured"
            emptyHint="Enable a review process on a module to route record changes through a reviewer."
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
                  <th className="px-5 py-3 text-start font-medium">Module</th>
                  <th className="px-5 py-3 text-start font-medium">Gated fields</th>
                  <th className="px-5 py-3 text-center font-medium">Status</th>
                  <th className="w-16 px-5 py-3 text-start font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {configList.rows.map((cfg, i) => (
                  <tr
                    key={cfg.id}
                    className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'}`}
                  >
                    <td className="px-5 py-3 font-medium capitalize text-on-surface">{cfg.module}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(cfg.fields ?? []).map((f) => (
                          <Pill key={f} tone="primary">
                            {f}
                          </Pill>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Pill tone={cfg.isActive ? 'success' : 'neutral'}>{cfg.isActive ? 'Active' : 'Off'}</Pill>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => removeConfig(cfg.id)}
                        className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`Delete ${cfg.module} review config`}
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
      ) : (
        <SetupTableCard
          state={pendingList.state}
          isEmpty={pendingList.rows.length === 0}
          emptyIcon={GitPullRequest}
          emptyTitle="No pending changes"
          emptyHint="Edits to review-gated fields will appear here for approval."
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
                <th className="px-5 py-3 text-start font-medium">Module</th>
                <th className="px-5 py-3 text-start font-medium">Record</th>
                <th className="px-5 py-3 text-start font-medium">Changes</th>
                <th className="w-28 px-5 py-3 text-center font-medium">Decision</th>
              </tr>
            </thead>
            <tbody>
              {pendingList.rows.map((change, i) => (
                <tr
                  key={change.id}
                  className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'}`}
                >
                  <td className="px-5 py-3 font-medium capitalize text-on-surface">{change.module}</td>
                  <td className="px-5 py-3 font-mono text-xs text-on-surface-variant">{change.recordId}</td>
                  <td className="px-5 py-3 text-xs text-on-surface-variant">
                    {Object.keys(change.changes ?? {}).join(', ') || '—'}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => decide(change.id, 'approve')}
                        className="rounded p-1.5 text-on-surface-variant hover:bg-success-container hover:text-on-success-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label="Approve change"
                      >
                        <Check className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        onClick={() => decide(change.id, 'reject')}
                        className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-on-error-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label="Reject change"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SetupTableCard>
      )}
    </div>
  );
}
