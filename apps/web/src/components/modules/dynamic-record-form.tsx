'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  evaluateFormula,
  type CustomField,
  type CustomLayout,
  type FieldIssue,
} from '@/hooks/use-custom-modules';

interface DynamicRecordFormProps {
  fields: CustomField[];
  layout?: CustomLayout;
  initialValues?: Record<string, unknown>;
  issues?: FieldIssue[];
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel?: () => void;
}

/**
 * Renders a create/edit form dynamically from a module's layout + field defs.
 * Correct input per field type; picklist selects; formula fields are read-only
 * and computed live; surfaces per-field 422 issues inline.
 */
export function DynamicRecordForm({
  fields,
  layout,
  initialValues,
  issues,
  submitting,
  submitLabel = 'Save',
  onSubmit,
  onCancel,
}: DynamicRecordFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(initialValues ?? {});
  const [formulaResults, setFormulaResults] = useState<Record<string, string>>({});

  const fieldByApi = useMemo(() => new Map(fields.map((f) => [f.apiName, f])), [fields]);
  const issueByField = useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of issues ?? []) map.set(issue.field, issue.message);
    return map;
  }, [issues]);

  const setValue = (apiName: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [apiName]: value }));
  };

  // Recompute formula fields whenever inputs change.
  const recomputeFormulas = async (nextValues: Record<string, unknown>) => {
    const results: Record<string, string> = {};
    for (const field of fields) {
      if (field.type === 'FORMULA' && field.formula) {
        try {
          const res = await evaluateFormula(field.formula, nextValues);
          results[field.apiName] = res.ok ? String(res.value) : '—';
        } catch {
          results[field.apiName] = '—';
        }
      }
    }
    setFormulaResults(results);
  };

  // Ordered sections from layout, falling back to a single section of all fields.
  const sections = layout?.sections?.length
    ? layout.sections
    : [{ title: 'Details', columns: 2, fields: fields.map((f) => f.apiName) }];

  const handleSubmit = () => {
    // Formula fields are computed server-side; do not submit them.
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      const field = fieldByApi.get(key);
      if (field?.type === 'FORMULA') continue;
      payload[key] = value;
    }
    onSubmit(payload);
  };

  const renderField = (apiName: string) => {
    const field = fieldByApi.get(apiName);
    if (!field) return null;
    const value = values[apiName];
    const issue = issueByField.get(apiName);
    const invalid = Boolean(issue);

    let control: React.ReactNode;
    switch (field.type) {
      case 'BOOLEAN':
        control = (
          <label className="flex items-center gap-2 text-sm text-on-surface">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => {
                const next = { ...values, [apiName]: e.target.checked };
                setValues(next);
              }}
            />
            {field.label}
          </label>
        );
        break;
      case 'PICKLIST':
        control = (
          <Select value={String(value ?? '')} invalid={invalid} onChange={(e) => setValue(apiName, e.target.value)}>
            <option value="">Select…</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </Select>
        );
        break;
      case 'MULTISELECT':
        control = (
          <select
            multiple
            aria-invalid={invalid || undefined}
            value={Array.isArray(value) ? (value as string[]) : []}
            onChange={(e) => setValue(apiName, Array.from(e.target.selectedOptions).map((o) => o.value))}
            className="flex min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
        break;
      case 'FORMULA':
        control = (
          <Input value={formulaResults[apiName] ?? '(computed)'} readOnly disabled className="bg-surface-container-low font-mono" />
        );
        break;
      case 'NUMBER':
      case 'CURRENCY':
        control = (
          <Input
            type="number"
            value={value === undefined || value === null ? '' : String(value)}
            invalid={invalid}
            onChange={(e) => setValue(apiName, e.target.value === '' ? '' : Number(e.target.value))}
            onBlur={() => recomputeFormulas(values)}
          />
        );
        break;
      case 'DATE':
        control = <Input type="date" value={String(value ?? '')} invalid={invalid} onChange={(e) => setValue(apiName, e.target.value)} />;
        break;
      case 'DATETIME':
        control = <Input type="datetime-local" value={String(value ?? '')} invalid={invalid} onChange={(e) => setValue(apiName, e.target.value)} />;
        break;
      case 'EMAIL':
        control = <Input type="email" value={String(value ?? '')} invalid={invalid} onChange={(e) => setValue(apiName, e.target.value)} />;
        break;
      case 'PHONE':
        control = <Input type="tel" value={String(value ?? '')} invalid={invalid} onChange={(e) => setValue(apiName, e.target.value)} />;
        break;
      default:
        control = <Input value={String(value ?? '')} invalid={invalid} onChange={(e) => setValue(apiName, e.target.value)} />;
    }

    return (
      <div key={apiName}>
        {field.type !== 'BOOLEAN' && (
          <label className="mb-1 block text-sm font-medium text-on-surface">
            {field.label}
            {field.required && <span className="ml-0.5 text-error">*</span>}
          </label>
        )}
        {control}
        {issue && <p className="mt-1 text-xs text-error">{issue}</p>}
      </div>
    );
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="space-y-6"
    >
      {sections.map((section, i) => (
        <div key={i}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-on-surface-variant">{section.title}</h3>
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, section.columns)}, minmax(0, 1fr))` }}
          >
            {section.fields.map(renderField)}
          </div>
        </div>
      ))}
      <div className="flex justify-end gap-2 border-t border-outline-variant pt-4">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        )}
        <Button type="submit" isLoading={submitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
