'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';
import { useUsers } from '@/hooks/use-users';
import {
  RULE_OPERATORS,
  TERRITORY_TYPES,
  type Territory,
  type TerritoryInput,
  type TerritoryRule,
  type TerritoryType,
} from '@/hooks/use-territories';

interface TerritoryFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: TerritoryInput) => Promise<void> | void;
  isSaving?: boolean;
  /** When present the modal edits an existing territory; otherwise it creates. */
  initial?: Territory | null;
}

const FIELD_SUGGESTIONS = [
  'country',
  'region',
  'state',
  'city',
  'industry',
  'annualRevenue',
  'employeeCount',
  'source',
  'segment',
];

type DraftRule = TerritoryRule & { key: string };

let ruleKeySeq = 0;
function newRule(): DraftRule {
  ruleKeySeq += 1;
  return { key: `r${ruleKeySeq}`, field: '', operator: 'eq', value: '' };
}

export function TerritoryFormModal({
  open,
  onClose,
  onSubmit,
  isSaving = false,
  initial,
}: TerritoryFormModalProps) {
  const isEdit = Boolean(initial);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TerritoryType>('GEOGRAPHIC');
  const [priority, setPriority] = useState('0');
  const [isDefault, setIsDefault] = useState(false);
  const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const [teamId, setTeamId] = useState('');
  const [rules, setRules] = useState<DraftRule[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [userSearch, setUserSearch] = useState('');
  const { data: users, isLoading: usersLoading } = useUsers({ search: userSearch, limit: 100 });

  // Reset the form whenever the modal opens (for create) or the target changes.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setName(initial.name);
      setDescription(initial.description ?? '');
      setType(initial.type);
      setPriority(String(initial.priority ?? 0));
      setIsDefault(Boolean(initial.isDefault));
      setOwnerIds(initial.ownerIds ?? []);
      setTeamId(initial.teamId ?? '');
      setRules(
        (initial.rules ?? []).map((r) => ({ ...newRule(), field: r.field, operator: r.operator, value: r.value }))
      );
    } else {
      setName('');
      setDescription('');
      setType('GEOGRAPHIC');
      setPriority('0');
      setIsDefault(false);
      setOwnerIds([]);
      setTeamId('');
      setRules([]);
    }
  }, [open, initial]);

  const userOptions: MultiSelectOption[] = useMemo(
    () =>
      (users?.data ?? []).map((u) => ({
        id: u.id,
        label: `${u.firstName} ${u.lastName}`.trim() || u.email,
        sublabel: u.email,
      })),
    [users]
  );

  const updateRule = (key: string, patch: Partial<TerritoryRule>) =>
    setRules((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    const cleanRules = rules
      .filter((r) => r.field.trim() && r.value.trim())
      .map(({ field, operator, value }) => ({ field: field.trim(), operator, value: value.trim() }));

    const input: TerritoryInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      type,
      ownerIds,
      teamId: teamId.trim() || undefined,
      priority: Number.isFinite(Number(priority)) ? Number(priority) : 0,
      isDefault,
      rules: cleanRules,
    };
    await onSubmit(input);
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Territory' : 'New Territory'} size="xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="EMEA Enterprise" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Type *</label>
            <Select value={type} onChange={(e) => setType(e.target.value as TerritoryType)}>
              {TERRITORY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={2}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Priority
              <span className="ms-1 font-normal text-gray-400">(higher wins first)</span>
            </label>
            <Input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Team ID</label>
            <Input value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder="Optional team id" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Owners
            <span className="ms-1 font-normal text-gray-400">
              (2+ owners → round-robin assignment)
            </span>
          </label>
          <MultiSelect
            value={ownerIds}
            onChange={setOwnerIds}
            options={userOptions}
            onSearchChange={setUserSearch}
            isLoading={usersLoading}
            placeholder="Select owners…"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4"
          />
          Default territory (catches records no rule matches)
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-xs font-medium text-gray-600">
              Routing Rules
              <span className="ms-1 font-normal text-gray-400">(all rules must match — logical AND)</span>
            </label>
            <Button type="button" variant="secondary" size="sm" onClick={() => setRules((p) => [...p, newRule()])}>
              + Add rule
            </Button>
          </div>

          {rules.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400">
              No rules. A rule-less territory only matches records via the default fallback.
            </p>
          ) : (
            <div className="space-y-2">
              <datalist id="territory-rule-fields">
                {FIELD_SUGGESTIONS.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              {rules.map((rule) => (
                <div key={rule.key} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                  <Input
                    list="territory-rule-fields"
                    value={rule.field}
                    onChange={(e) => updateRule(rule.key, { field: e.target.value })}
                    placeholder="field (e.g. country)"
                  />
                  <Select
                    value={rule.operator}
                    onChange={(e) => updateRule(rule.key, { operator: e.target.value })}
                    className="w-auto"
                  >
                    {RULE_OPERATORS.map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    value={rule.value}
                    onChange={(e) => updateRule(rule.key, { value: e.target.value })}
                    placeholder="value"
                  />
                  <button
                    type="button"
                    onClick={() => setRules((p) => p.filter((r) => r.key !== rule.key))}
                    className="rounded-lg px-2 py-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove rule"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} isLoading={isSaving}>
            {isEdit ? 'Save Changes' : 'Create Territory'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
