'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  GitBranch,
  Loader2,
  LockKeyhole,
  Plus,
  Save,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { notify } from '@/lib/toast';

type ValidationRule = {
  id: string;
  objectType: string;
  field: string;
  label: string;
  ruleType: 'required';
  enabled: boolean;
  message: string;
  configurable: boolean;
  updatedAt: string;
};

type ValidationField = {
  objectType: string;
  field: string;
  label: string;
  dataType: string;
  group: string;
  system: boolean;
  defaultMessage: string;
};

type PolicyDraft = {
  objectType: string;
  field: string;
  label: string;
  message: string;
  enabled: boolean;
  customField: string;
  useCustomField: boolean;
};

const MODULES = [
  { id: 'contact', label: 'Contacts', description: 'Account link, ownership, consent, communication profile.' },
  { id: 'account', label: 'Accounts', description: 'Company identity, billing/shipping, tax and territory fields.' },
  { id: 'lead', label: 'Leads', description: 'Attribution, qualification, routing and conversion readiness.' },
  { id: 'deal', label: 'Deals', description: 'Pipeline integrity, stage movement and forecast fields.' },
  { id: 'product', label: 'Products', description: 'Catalog, SKU, price, currency and tax readiness.' },
  { id: 'quote', label: 'Quotes', description: 'CPQ template, account/deal links, validity and approvals.' },
  { id: 'activity', label: 'Activities', description: 'Tasks, calls, meetings and relationship timeline evidence.' },
] as const;

export default function AdminValidationRulesPage() {
  const [rules, setRules] = useState<ValidationRule[]>([]);
  const [fields, setFields] = useState<ValidationField[]>([]);
  const [selectedModule, setSelectedModule] = useState<string>('contact');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<PolicyDraft>({
    objectType: 'contact',
    field: '',
    label: '',
    message: '',
    enabled: true,
    customField: '',
    useCustomField: false,
  });

  useEffect(() => {
    let mounted = true;
    async function loadRules() {
      setLoading(true);
      const res = await fetch('/api/crm/validation-rules?includeFields=true', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (mounted) {
        setRules(Array.isArray(body.data?.rules) ? body.data.rules : []);
        setFields(Array.isArray(body.data?.fields) ? body.data.fields : []);
        setLoading(false);
      }
    }
    loadRules().catch(() => {
      notify.error('Validation rules unavailable', 'Could not load field policy rules.');
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const activeRules = useMemo(
    () => rules.filter((rule) => rule.objectType === selectedModule),
    [rules, selectedModule]
  );
  const activeFields = useMemo(
    () => fields.filter((field) => field.objectType === selectedModule),
    [fields, selectedModule]
  );
  const availableFields = useMemo(
    () => activeFields.filter((field) => !activeRules.some((rule) => rule.field === field.field)),
    [activeFields, activeRules]
  );
  const fieldGroups = useMemo(() => {
    const groups = new Map<string, ValidationField[]>();
    for (const field of activeFields) {
      groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
    }
    return Array.from(groups.entries());
  }, [activeFields]);
  const requiredCount = activeRules.filter((rule) => rule.enabled).length;
  const allRequiredCount = rules.filter((rule) => rule.enabled).length;
  const selectedDefinition = MODULES.find((module) => module.id === selectedModule) ?? MODULES[0];

  async function updateRule(rule: ValidationRule, patch: Partial<ValidationRule>) {
    const nextRule = { ...rule, ...patch };
    setRules((current) => current.map((item) => (item.id === rule.id ? nextRule : item)));
    setSavingId(rule.id);
    const res = await fetch(`/api/crm/validation-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    setSavingId(null);
    if (!res.ok) {
      setRules((current) => current.map((item) => (item.id === rule.id ? rule : item)));
      notify.error('Rule not saved', 'The validation policy change could not be saved.');
      return;
    }
    notify.success(`${nextRule.label} policy updated.`);
  }

  function startCreate() {
    const firstField = availableFields[0];
    setDraft({
      objectType: selectedModule,
      field: firstField?.field ?? '',
      label: firstField?.label ?? '',
      message: firstField?.defaultMessage ?? '',
      enabled: true,
      customField: '',
      useCustomField: !firstField,
    });
    setCreating(true);
  }

  function updateDraftField(fieldName: string) {
    const definition = fields.find((item) => item.objectType === draft.objectType && item.field === fieldName);
    setDraft((current) => ({
      ...current,
      field: fieldName,
      label: definition?.label ?? current.label,
      message: definition?.defaultMessage ?? current.message,
    }));
  }

  async function createPolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = draft.useCustomField ? draft.customField.trim() : draft.field.trim();
    const label = draft.label.trim() || field;
    if (!field) {
      notify.error('Field is required', 'Choose a module field or enter a custom field key.');
      return;
    }

    const res = await fetch('/api/crm/validation-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectType: draft.objectType,
        field,
        label,
        enabled: draft.enabled,
        message: draft.message.trim() || `${label} is required.`,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify.error('Policy not created', body?.error?.message ?? 'Could not create validation policy.');
      return;
    }
    setRules((current) => [body.data, ...current]);
    setSelectedModule(draft.objectType);
    setCreating(false);
    notify.success(`${label} policy created.`);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-blue-300">
              <LockKeyhole className="h-4 w-4" />
              Admin controlled policy
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">System Field Validation Rules</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-gray-300">
              Choose which fields are optional or required across the CRM. These rules are global policy, owned by the
              admin panel, and are consumed by module forms, imports, and API validation paths as each service is
              hardened.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AdminMetric label="Modules covered" value={String(MODULES.length)} />
            <AdminMetric label="Required fields" value={String(allRequiredCount)} />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            New Policy
          </button>
          <span className="text-xs text-gray-400">
            Policies can be created from module field catalogs or custom field keys.
          </span>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        <aside className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-200">
            <Database className="h-4 w-4 text-blue-300" />
            CRM modules
          </div>
          <div className="space-y-2">
            {MODULES.map((module) => {
              const moduleRules = rules.filter((rule) => rule.objectType === module.id);
              const moduleRequired = moduleRules.filter((rule) => rule.enabled).length;
              const active = selectedModule === module.id;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setSelectedModule(module.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    active
                      ? 'border-blue-500 bg-blue-600 text-white'
                      : 'border-gray-800 bg-gray-950 text-gray-300 hover:border-gray-700 hover:bg-gray-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{module.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white/15' : 'bg-gray-800'}`}>
                      {moduleRequired}/{moduleRules.length}
                    </span>
                  </div>
                  <p className={`mt-1 text-xs leading-5 ${active ? 'text-blue-100' : 'text-gray-500'}`}>
                    {module.description}
                  </p>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-xl">
          <div className="border-b border-gray-800 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300">
                  {selectedDefinition.label}
                </p>
                <h2 className="mt-1 text-xl font-bold text-white">Required Field Policy</h2>
                <p className="mt-1 text-sm text-gray-400">{selectedDefinition.description}</p>
                <p className="mt-2 text-xs text-gray-500">
                  Reading {activeFields.length} fields across {fieldGroups.length} field groups for this module.
                </p>
              </div>
              <div className="rounded-lg border border-blue-900/70 bg-blue-950/40 px-4 py-2 text-sm font-bold text-blue-200">
                {requiredCount} active required fields
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-sm text-gray-400">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Loading validation rules...
            </div>
          ) : activeRules.length === 0 ? (
            <div className="p-8 text-sm text-gray-400">No validation rules configured for this module.</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {activeRules.map((rule) => (
                <div key={rule.id} className="grid gap-4 px-6 py-5 lg:grid-cols-[220px_minmax(0,1fr)_170px] lg:items-center">
                  <div>
                    <p className="font-semibold text-white">{rule.label}</p>
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{rule.field}</p>
                  </div>
                  <input
                    value={rule.message}
                    onChange={(event) => updateRule(rule, { message: event.target.value })}
                    className="h-10 rounded-lg border border-gray-700 bg-gray-950 px-3 text-sm text-gray-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-sm font-semibold ${rule.enabled ? 'text-blue-200' : 'text-gray-400'}`}>
                      {rule.enabled ? 'Required' : 'Optional'}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateRule(rule, { enabled: !rule.enabled })}
                      className={`relative h-7 w-12 rounded-full transition ${
                        rule.enabled ? 'bg-blue-600' : 'bg-gray-700'
                      }`}
                      aria-label={`Toggle ${rule.label}`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                          rule.enabled ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                    {savingId === rule.id ? <Loader2 className="h-4 w-4 animate-spin text-blue-300" /> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">Module Fields</h2>
                <p className="mt-1 text-xs text-gray-500">Field catalog read by policy builder.</p>
              </div>
              <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs font-bold text-gray-300">
                {activeFields.length}
              </span>
            </div>
            <div className="mt-4 max-h-72 space-y-4 overflow-y-auto pr-1">
              {fieldGroups.map(([group, groupFields]) => (
                <div key={group}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">{group}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {groupFields.map((field) => {
                      const exists = activeRules.some((rule) => rule.field === field.field);
                      return (
                        <span
                          key={field.field}
                          className={`rounded px-2 py-1 text-xs ${
                            exists ? 'bg-blue-950 text-blue-200' : 'bg-gray-800 text-gray-300'
                          }`}
                        >
                          {field.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
              <GitBranch className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-white">How the policy runs</h2>
            <div className="mt-4 space-y-4 text-sm text-gray-300">
              <PolicyLine text="Admin panel is the only UI for changing required-field policy." />
              <PolicyLine text="Rules are stored by module and field, so the same engine can govern all services." />
              <PolicyLine text="Contacts enforce this policy in the API before duplicate checks." />
              <PolicyLine text="Accounts, leads, deals, and quotes enforce the same policy in preview and service routes as they are created or updated." />
            </div>
            <button className="mt-6 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-bold text-white">
              <Save className="h-4 w-4" />
              Auto-saved Policy
            </button>
          </div>

          <div className="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-5 text-sm text-amber-100">
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4" />
              Governance note
            </div>
            <p className="mt-2 leading-6 text-amber-100/80">
              Making a field required affects manual creation, imports, and future integration syncs once that module is
              connected to the shared validation engine.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-200">
              <SlidersHorizontal className="h-4 w-4 text-blue-300" />
              Next hardening path
            </div>
            <div className="mt-4 space-y-3 text-sm text-gray-400">
              <PolicyLine text="Extend import validators to show the same policy errors row by row." />
              <PolicyLine text="Add approval-gated policy changes for regulated modules." />
              <PolicyLine text="Expose custom fields as rule candidates in every module catalog." />
            </div>
          </div>
        </aside>
      </section>

      {creating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={createPolicy} className="w-full max-w-2xl rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-white">Create Validation Policy</h2>
                <p className="text-sm text-gray-400">Choose a module-specific field and define how the system validates it.</p>
              </div>
              <button type="button" onClick={() => setCreating(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-4 p-6">
              <label className="grid gap-1 text-sm">
                <span className="font-semibold text-gray-300">Module</span>
                <select
                  value={draft.objectType}
                  onChange={(event) => {
                    const objectType = event.target.value;
                    const moduleFields = fields.filter((field) => field.objectType === objectType);
                    const existingFields = rules.filter((rule) => rule.objectType === objectType).map((rule) => rule.field);
                    const firstField = moduleFields.find((field) => !existingFields.includes(field.field));
                    setDraft({
                      objectType,
                      field: firstField?.field ?? '',
                      label: firstField?.label ?? '',
                      message: firstField?.defaultMessage ?? '',
                      enabled: true,
                      customField: '',
                      useCustomField: !firstField,
                    });
                  }}
                  className="h-10 rounded-lg border border-gray-700 bg-gray-950 px-3 text-gray-100 outline-none focus:border-blue-500"
                >
                  {MODULES.map((module) => (
                    <option key={module.id} value={module.id}>{module.label}</option>
                  ))}
                </select>
              </label>

              <label className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 px-4 py-3 text-sm">
                <span className="font-semibold text-gray-300">Use custom field key</span>
                <input
                  type="checkbox"
                  checked={draft.useCustomField}
                  onChange={(event) => setDraft((current) => ({ ...current, useCustomField: event.target.checked }))}
                  className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
                />
              </label>

              {draft.useCustomField ? (
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold text-gray-300">Custom field key</span>
                  <input
                    value={draft.customField}
                    onChange={(event) => setDraft((current) => ({ ...current, customField: event.target.value, label: current.label || event.target.value }))}
                    placeholder="customFields.customerSegment"
                    className="h-10 rounded-lg border border-gray-700 bg-gray-950 px-3 text-gray-100 outline-none focus:border-blue-500"
                  />
                </label>
              ) : (
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold text-gray-300">Module field</span>
                  <select
                    value={draft.field}
                    onChange={(event) => updateDraftField(event.target.value)}
                    className="h-10 rounded-lg border border-gray-700 bg-gray-950 px-3 text-gray-100 outline-none focus:border-blue-500"
                  >
                    {fields
                      .filter((field) => field.objectType === draft.objectType)
                      .map((field) => (
                        <option key={field.field} value={field.field} disabled={rules.some((rule) => rule.objectType === field.objectType && rule.field === field.field)}>
                          {field.label} - {field.group}{rules.some((rule) => rule.objectType === field.objectType && rule.field === field.field) ? ' (policy exists)' : ''}
                        </option>
                      ))}
                  </select>
                </label>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold text-gray-300">Policy label</span>
                  <input
                    value={draft.label}
                    onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
                    className="h-10 rounded-lg border border-gray-700 bg-gray-950 px-3 text-gray-100 outline-none focus:border-blue-500"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold text-gray-300">Initial status</span>
                  <select
                    value={draft.enabled ? 'required' : 'optional'}
                    onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.value === 'required' }))}
                    className="h-10 rounded-lg border border-gray-700 bg-gray-950 px-3 text-gray-100 outline-none focus:border-blue-500"
                  >
                    <option value="required">Required</option>
                    <option value="optional">Optional</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-1 text-sm">
                <span className="font-semibold text-gray-300">Validation message</span>
                <input
                  value={draft.message}
                  onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))}
                  className="h-10 rounded-lg border border-gray-700 bg-gray-950 px-3 text-gray-100 outline-none focus:border-blue-500"
                />
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-gray-800 px-6 py-4">
              <button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-bold text-gray-200 hover:bg-gray-800">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500">
                Create Policy
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function AdminMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function PolicyLine({ text }: { text: string }) {
  return (
    <div className="flex gap-3">
      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
      <p>{text}</p>
    </div>
  );
}
