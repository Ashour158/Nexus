'use client';

import React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { notify } from '@/lib/toast';

interface FieldDef {
  id: string;
  name: string;
  apiKey: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'url';
  options: string[];
  required: boolean;
}

interface Props {
  entityType: 'contact' | 'deal' | 'lead' | 'account';
  entityId: string;
  currentValues: Record<string, unknown>;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  readOnly?: boolean;
}

export default function CustomFieldsForm({ entityType, entityId, currentValues, onSave, readOnly }: Props) {
  const { data: fieldDefs = [] } = useQuery<FieldDef[]>({
    queryKey: ['custom-field-defs', entityType],
    queryFn: () => fetch(`/api/custom-fields?entityType=${entityType}`).then((r) => r.json()),
  });

  const [values, setValues] = React.useState<Record<string, unknown>>(currentValues ?? {});

  React.useEffect(() => {
    setValues(currentValues ?? {});
  }, [entityId, currentValues]);

  const saveMutation = useMutation({
    mutationFn: () => onSave(values),
    onSuccess: () => notify.success('Custom fields saved'),
    onError: (err: any) => notify.error('Failed to save', err?.message),
  });

  if (fieldDefs.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Custom Fields</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fieldDefs.map((field) => (
          <div key={field.id} className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              {field.name}
              {field.required ? <span className="ms-1 text-red-500">*</span> : null}
            </label>
            {field.fieldType === 'text' ? (
              <input value={(values[field.apiKey] as string) ?? ''} onChange={(e) => setValues((v) => ({ ...v, [field.apiKey]: e.target.value }))} disabled={readOnly} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            ) : null}
            {field.fieldType === 'number' ? (
              <input type="number" value={(values[field.apiKey] as number) ?? ''} onChange={(e) => setValues((v) => ({ ...v, [field.apiKey]: Number(e.target.value) }))} disabled={readOnly} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            ) : null}
            {field.fieldType === 'date' ? (
              <input type="date" value={(values[field.apiKey] as string) ?? ''} onChange={(e) => setValues((v) => ({ ...v, [field.apiKey]: e.target.value }))} disabled={readOnly} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            ) : null}
            {field.fieldType === 'select' || field.fieldType === 'multiselect' ? (
              <select value={(values[field.apiKey] as string) ?? ''} onChange={(e) => setValues((v) => ({ ...v, [field.apiKey]: e.target.value }))} disabled={readOnly} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">- Select -</option>
                {(field.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : null}
            {field.fieldType === 'checkbox' ? (
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={(values[field.apiKey] as boolean) ?? false} onChange={(e) => setValues((v) => ({ ...v, [field.apiKey]: e.target.checked }))} disabled={readOnly} className="h-4 w-4 accent-indigo-600" />
                <span className="text-sm text-gray-600">Yes</span>
              </label>
            ) : null}
            {field.fieldType === 'url' ? (
              <input type="url" value={(values[field.apiKey] as string) ?? ''} onChange={(e) => setValues((v) => ({ ...v, [field.apiKey]: e.target.value }))} disabled={readOnly} placeholder="https://" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            ) : null}
          </div>
        ))}
      </div>
      {!readOnly ? (
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {saveMutation.isPending ? 'Saving...' : 'Save Custom Fields'}
        </button>
      ) : null}
    </div>
  );
}
