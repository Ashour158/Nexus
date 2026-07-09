'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, ShieldCheck, Lock } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useRoles } from '@/hooks/use-roles';
import {
  useFieldPermissions,
  useCreateFieldPermission,
  useDeleteFieldPermission,
} from '@/hooks/use-field-permissions';

type ObjectType = 'account' | 'contact' | 'deal' | 'lead';

const OBJECT_TABS: { key: ObjectType; label: string }[] = [
  { key: 'account', label: 'Accounts' },
  { key: 'contact', label: 'Contacts' },
  { key: 'deal', label: 'Deals' },
  { key: 'lead', label: 'Leads' },
];

export default function FieldPermissionsSettingsPage() {
  const [objectType, setObjectType] = useState<ObjectType>('account');
  const [fieldName, setFieldName] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const { data: rules = [], isLoading } = useFieldPermissions();
  const { data: roleData } = useRoles();
  const roles = roleData?.data ?? [];
  const createRule = useCreateFieldPermission();
  const deleteRule = useDeleteFieldPermission();

  const rows = useMemo(
    () => rules.filter((r) => r.objectType === objectType),
    [rules, objectType]
  );

  const toggleRole = (roleName: string) =>
    setSelectedRoles((prev) =>
      prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName]
    );

  const add = () => {
    if (!fieldName.trim()) {
      notify.error('Enter a field name');
      return;
    }
    if (selectedRoles.length === 0) {
      notify.error('Select at least one role');
      return;
    }
    createRule.mutate(
      { objectType, fieldName: fieldName.trim(), allowedRoles: selectedRoles },
      {
        onSuccess: () => {
          notify.success('Field permission added');
          setFieldName('');
          setSelectedRoles([]);
        },
        onError: (err) => notify.error('Failed to add rule', err.message),
      }
    );
  };

  const remove = (id: string) =>
    deleteRule.mutate(id, {
      onSuccess: () => notify.success('Rule removed'),
      onError: (err) => notify.error('Failed to remove rule', err.message),
    });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <ShieldCheck className="h-6 w-6 text-blue-600" /> Field Permissions
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Restrict who can read and write specific fields. Only the selected roles may access a
          field; everyone else has it masked/blocked. Enforced server-side on every CRM write.
        </p>
      </div>

      <div className="flex w-fit overflow-hidden rounded-lg border border-gray-200">
        {OBJECT_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setObjectType(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              objectType === tab.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-5">
        <h3 className="font-semibold text-blue-900">
          New rule on {OBJECT_TABS.find((t) => t.key === objectType)?.label}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Field name</label>
            <input
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              placeholder="e.g. annualRevenue"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              The API field name (e.g. <code>annualRevenue</code>, <code>ssn</code>).
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Allowed roles</label>
            <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-2">
              {roles.length === 0 ? (
                <span className="px-1 text-xs text-gray-400">No roles available</span>
              ) : (
                roles.map((role) => {
                  const active = selectedRoles.includes(role.name);
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => toggleRole(role.name)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {role.name}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={add}
            disabled={createRule.isPending || !fieldName.trim() || selectedRoles.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {createRule.isPending ? 'Adding…' : 'Add rule'}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading rules…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <Lock className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">
              No field restrictions on {OBJECT_TABS.find((t) => t.key === objectType)?.label}
            </p>
            <p className="mt-1 text-xs text-gray-400">All fields are readable/writable by default.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase text-gray-500">
                <th className="px-5 py-3 text-start font-medium">Field</th>
                <th className="px-5 py-3 text-start font-medium">Allowed roles</th>
                <th className="w-20 px-5 py-3 text-start font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rule, i) => (
                <tr
                  key={rule.id}
                  className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'} hover:bg-blue-50/30`}
                >
                  <td className="px-5 py-3 font-mono text-xs text-gray-900">{rule.fieldName}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {rule.allowedRoles.length === 0 ? (
                        <span className="text-xs text-gray-400">None</span>
                      ) : (
                        rule.allowedRoles.map((r) => (
                          <span
                            key={r}
                            className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                          >
                            {r}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => remove(rule.id)}
                      disabled={deleteRule.isPending}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                      title="Remove rule"
                      aria-label="Remove rule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
