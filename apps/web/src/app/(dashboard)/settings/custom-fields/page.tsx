'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, GripVertical, Settings2 } from 'lucide-react';
import { notify } from '@/lib/toast';

type EntityType = 'contact' | 'deal' | 'lead' | 'account';
type FieldType = 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'url';

interface FieldDef {
  id: string;
  name: string;
  apiKey: string;
  fieldType: FieldType;
  options: string[];
  required: boolean;
  showOnCard: boolean;
  position: number;
}

const ENTITY_TABS: { key: EntityType; label: string }[] = [
  { key: 'contact', label: 'Contacts' },
  { key: 'deal', label: 'Deals' },
  { key: 'lead', label: 'Leads' },
  { key: 'account', label: 'Accounts' },
];

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown (single)' },
  { value: 'multiselect', label: 'Dropdown (multi)' },
  { value: 'checkbox', label: 'Checkbox (Yes/No)' },
  { value: 'url', label: 'URL / Link' },
];

export default function CustomFieldsSettingsPage() {
  const [entityType, setEntityType] = useState<EntityType>('contact');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newField, setNewField] = useState({ name: '', fieldType: 'text' as FieldType, required: false, options: '' });
  const qc = useQueryClient();

  const { data: fields = [], isLoading } = useQuery<FieldDef[]>({
    queryKey: ['custom-field-defs', entityType],
    queryFn: () => fetch(`/api/custom-fields?entityType=${entityType}`).then((r) => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => {
        if (!r.ok) throw new Error('Create failed');
        return r.json();
      }),
    onSuccess: () => {
      notify.success('Field created');
      setShowAddForm(false);
      setNewField({ name: '', fieldType: 'text', required: false, options: '' });
      void qc.invalidateQueries({ queryKey: ['custom-field-defs', entityType] });
    },
    onError: (err: any) => notify.error('Failed to create field', err?.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/custom-fields/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify.success('Field removed');
      void qc.invalidateQueries({ queryKey: ['custom-field-defs', entityType] });
    },
    onError: () => notify.error('Failed to remove field'),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><Settings2 className="h-6 w-6 text-blue-600" /> Custom Fields</h1>
          <p className="mt-1 text-sm text-gray-500">Add fields specific to your business.</p>
        </div>
        <button onClick={() => setShowAddForm(true)} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Add Field</button>
      </div>

      <div className="flex w-fit overflow-hidden rounded-lg border border-gray-200">
        {ENTITY_TABS.map((tab) => (
          <button key={tab.key} onClick={() => setEntityType(tab.key)} className={`px-4 py-2 text-sm font-medium transition-colors ${entityType === tab.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{tab.label}</button>
        ))}
      </div>

      {showAddForm ? (
        <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-5">
          <h3 className="font-semibold text-blue-900">New field on {ENTITY_TABS.find((t) => t.key === entityType)?.label}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Field Label</label>
              <input value={newField.name} onChange={(e) => setNewField((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. MENA Sub-region" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Field Type</label>
              <select value={newField.fieldType} onChange={(e) => setNewField((f) => ({ ...f, fieldType: e.target.value as FieldType }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                {FIELD_TYPES.map((ft) => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
              </select>
            </div>
            {newField.fieldType === 'select' || newField.fieldType === 'multiselect' ? (
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Options</label>
                <input value={newField.options} onChange={(e) => setNewField((f) => ({ ...f, options: e.target.value }))} placeholder="Egypt, KSA, UAE" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <input type="checkbox" id="required" checked={newField.required} onChange={(e) => setNewField((f) => ({ ...f, required: e.target.checked }))} className="accent-blue-600" />
              <label htmlFor="required" className="text-sm text-gray-700">Required field</label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button disabled={!newField.name.trim() || createMutation.isPending} onClick={() => createMutation.mutate({ entityType, name: newField.name.trim(), fieldType: newField.fieldType, required: newField.required, options: newField.options ? newField.options.split(',').map((o) => o.trim()).filter(Boolean) : [] })} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{createMutation.isPending ? 'Creating...' : 'Create Field'}</button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {isLoading ? <div className="p-8 text-center text-sm text-gray-400">Loading fields...</div> : null}
        {!isLoading && fields.length === 0 ? <div className="p-12 text-center"><Settings2 className="mx-auto mb-3 h-10 w-10 text-gray-300" /><p className="text-sm font-medium text-gray-500">No custom fields yet</p></div> : null}
        {!isLoading && fields.length > 0 ? (
          <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase text-gray-500"><th className="w-8 px-5 py-3 text-start font-medium"></th><th className="px-5 py-3 text-start font-medium">Field Name</th><th className="px-5 py-3 text-start font-medium">API Key</th><th className="px-5 py-3 text-start font-medium">Type</th><th className="px-5 py-3 text-start font-medium">Required</th><th className="w-20 px-5 py-3 text-start font-medium">Actions</th></tr></thead><tbody>
            {fields.map((field, i) => (
              <tr key={field.id} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'} hover:bg-blue-50/30`}>
                <td className="cursor-grab px-3 py-3 text-gray-300"><GripVertical className="h-4 w-4" /></td>
                <td className="px-5 py-3 font-medium text-gray-900">{field.name}</td>
                <td className="bg-gray-50/80 px-5 py-3 font-mono text-xs text-gray-500">{field.apiKey}</td>
                <td className="px-5 py-3 capitalize text-gray-600">{field.fieldType}</td>
                <td className="px-5 py-3">{field.required ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">Required</span> : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Optional</span>}</td>
                <td className="px-5 py-3"><button onClick={() => deleteMutation.mutate(field.id)} disabled={deleteMutation.isPending} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50" title="Remove field" aria-label="Remove field"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody></table>
        ) : null}
      </div>
    </div>
  );
}
