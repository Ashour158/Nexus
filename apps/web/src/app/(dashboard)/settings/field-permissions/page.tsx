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
        <h1 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
          <ShieldCheck className="h-6 w-6 text-primary" /> Field Permissions
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Restrict who can read and write specific fields. Only the selected roles may access a
          field; everyone else has it masked/blocked. Enforced server-side on every CRM write.
        </p>
      </div>

      <div className="flex w-fit overflow-hidden rounded-lg border border-outline-variant">
        {OBJECT_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setObjectType(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              objectType === tab.key ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border border-primary/40 bg-primary-container p-5">
        <h3 className="font-semibold text-on-primary-container">
          New rule on {OBJECT_TABS.find((t) => t.key === objectType)?.label}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">Field name</label>
            <input
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              placeholder="e.g. annualRevenue"
              className="w-full rounded-lg border border-outline-variant px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-on-surface-variant">
              The API field name (e.g. <code>annualRevenue</code>, <code>ssn</code>).
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-on-surface">Allowed roles</label>
            <div className="flex flex-wrap gap-2 rounded-lg border border-outline-variant bg-surface p-2">
              {roles.length === 0 ? (
                <span className="px-1 text-xs text-on-surface-variant">No roles available</span>
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
                          ? 'bg-primary text-white'
                          : 'border border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-low'
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
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {createRule.isPending ? 'Adding…' : 'Add rule'}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-on-surface-variant">Loading rules…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <Lock className="mx-auto mb-3 h-10 w-10 text-outline" />
            <p className="text-sm font-medium text-on-surface-variant">
              No field restrictions on {OBJECT_TABS.find((t) => t.key === objectType)?.label}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">All fields are readable/writable by default.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase text-on-surface-variant">
                <th className="px-5 py-3 text-start font-medium">Field</th>
                <th className="px-5 py-3 text-start font-medium">Allowed roles</th>
                <th className="w-20 px-5 py-3 text-start font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rule, i) => (
                <tr
                  key={rule.id}
                  className={`border-b border-outline-variant ${i % 2 === 0 ? '' : 'bg-surface-container-low/50'} hover:bg-primary-container/30`}
                >
                  <td className="px-5 py-3 font-mono text-xs text-on-surface">{rule.fieldName}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {rule.allowedRoles.length === 0 ? (
                        <span className="text-xs text-on-surface-variant">None</span>
                      ) : (
                        rule.allowedRoles.map((r) => (
                          <span
                            key={r}
                            className="rounded-full bg-primary-container px-2 py-0.5 text-xs font-medium text-primary"
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
                      className="rounded p-1.5 text-on-surface-variant hover:bg-error-container hover:text-error disabled:opacity-50"
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
