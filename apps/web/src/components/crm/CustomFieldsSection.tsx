'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SlidersHorizontal, Save } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Renders and edits a record's `customFields` against the tenant's custom-field
 * definitions (fetched from /api/custom-fields?entityType=account|contact).
 *
 * Inputs are chosen by `fieldType` (text / number / boolean / date / picklist).
 * Saving delegates to `onSave`, which the parent wires to its update hook so the
 * merged `customFields` object is persisted through the normal PATCH flow.
 */

type CustomFieldDefinition = {
  id: string;
  entityType: string;
  name: string;
  apiKey: string;
  fieldType: string;
  options?: unknown;
  required?: boolean;
  position?: number;
};

type Primitive = string | number | boolean | null;

function optionValues(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((opt) => {
      if (typeof opt === 'string') return opt;
      if (opt && typeof opt === 'object') {
        const o = opt as Record<string, unknown>;
        return String(o.value ?? o.label ?? '');
      }
      return '';
    })
    .filter(Boolean);
}

export function CustomFieldsSection({
  entityType,
  customFields,
  canUpdate,
  isSaving,
  onSave,
}: {
  entityType: 'account' | 'contact';
  customFields: Record<string, unknown> | null | undefined;
  canUpdate: boolean;
  isSaving: boolean;
  onSave: (nextCustomFields: Record<string, unknown>) => void;
}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = {};
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    if (tenantId) h['x-tenant-id'] = tenantId;
    return h;
  }, [accessToken, tenantId]);

  const defsQuery = useQuery<CustomFieldDefinition[]>({
    queryKey: ['custom-field-defs', entityType, accessToken],
    queryFn: async () => {
      const res = await fetch(`/api/custom-fields?entityType=${entityType}`, { headers: authHeaders });
      const json = (await res.json().catch(() => [])) as { data?: CustomFieldDefinition[] } | CustomFieldDefinition[];
      const rows = Array.isArray(json) ? json : (json.data ?? []);
      return Array.isArray(rows) ? rows : [];
    },
  });

  const definitions = useMemo(
    () => [...(defsQuery.data ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [defsQuery.data]
  );

  const [draft, setDraft] = useState<Record<string, Primitive>>({});

  // Seed the draft from the record whenever definitions or the record change.
  useEffect(() => {
    const seed: Record<string, Primitive> = {};
    for (const def of definitions) {
      const raw = customFields?.[def.apiKey];
      seed[def.apiKey] = raw === null || raw === undefined ? '' : (raw as Primitive);
    }
    setDraft(seed);
  }, [definitions, customFields]);

  if (defsQuery.isLoading) {
    return <div className="h-24 animate-pulse rounded-xl bg-slate-100" />;
  }

  if (definitions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center">
        <SlidersHorizontal className="mx-auto h-6 w-6 text-slate-300" />
        <p className="mt-2 text-sm font-semibold text-slate-700">No custom fields defined</p>
        <p className="mt-1 text-xs text-slate-500">
          Custom fields for {entityType}s are configured in Settings. Once created they appear here for editing.
        </p>
      </div>
    );
  }

  const setValue = (apiKey: string, value: Primitive) => setDraft((prev) => ({ ...prev, [apiKey]: value }));

  const handleSave = () => {
    // Merge the draft back over the full customFields object so unmanaged keys survive.
    const merged: Record<string, unknown> = { ...(customFields ?? {}) };
    for (const def of definitions) {
      const v = draft[def.apiKey];
      merged[def.apiKey] = v === '' ? null : v;
    }
    onSave(merged);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
          Custom fields
        </div>
        {canUpdate ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving' : 'Save custom fields'}
          </button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {definitions.map((def) => (
          <FieldInput
            key={def.id}
            def={def}
            value={draft[def.apiKey] ?? ''}
            disabled={!canUpdate}
            onChange={(v) => setValue(def.apiKey, v)}
          />
        ))}
      </div>
    </div>
  );
}

function FieldInput({
  def,
  value,
  disabled,
  onChange,
}: {
  def: CustomFieldDefinition;
  value: Primitive;
  disabled: boolean;
  onChange: (value: Primitive) => void;
}) {
  const type = def.fieldType.toLowerCase();
  const label = (
    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
      {def.name}
      {def.required ? <span className="ml-1 text-rose-500">*</span> : null}
    </span>
  );
  const inputCls =
    'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400';

  if (type === 'boolean' || type === 'checkbox') {
    return (
      <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700">
        {def.name}
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
      </label>
    );
  }

  if (type === 'picklist' || type === 'select' || type === 'dropdown') {
    const opts = optionValues(def.options);
    return (
      <label className="block">
        {label}
        <select
          value={value === null ? '' : String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        >
          <option value="">Not set</option>
          {opts.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const htmlType =
    type === 'number' || type === 'currency'
      ? 'number'
      : type === 'date'
        ? 'date'
        : type === 'datetime'
          ? 'datetime-local'
          : type === 'email'
            ? 'email'
            : 'text';

  return (
    <label className="block">
      {label}
      <input
        type={htmlType}
        value={value === null ? '' : String(value)}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          onChange(htmlType === 'number' ? (v === '' ? '' : Number(v)) : v);
        }}
        className={inputCls}
      />
    </label>
  );
}
