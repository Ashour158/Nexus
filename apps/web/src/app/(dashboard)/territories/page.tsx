'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/hooks/use-confirm';
import { useAuthStore } from '@/stores/auth.store';
import { useUsers } from '@/hooks/use-users';
import {
  TERRITORY_TYPES,
  useCreateTerritory,
  useDeleteTerritory,
  useTerritories,
  useTerritory,
  useUpdateTerritory,
  type Territory,
  type TerritoryInput,
} from '@/hooks/use-territories';
import { TerritoryFormModal } from '@/components/territories/territory-form-modal';
import { RoutingLogsPanel } from '@/components/territories/routing-logs-panel';
import { TestAssignmentPanel } from '@/components/territories/test-assignment-panel';

type Tab = 'territories' | 'routing-logs' | 'test';

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  TERRITORY_TYPES.map((t) => [t.value, t.label])
);

export default function TerritoriesPage() {
  const roles = useAuthStore((s) => s.roles);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isAdmin = roles.some((r) => r.toLowerCase() === 'admin') || hasPermission('settings:update');

  const { confirm, ConfirmDialog } = useConfirm();
  const [tab, setTab] = useState<Tab>('territories');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Territory | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: territories, isLoading, isError, refetch } = useTerritories();
  const { data: detail } = useTerritory(selectedId);
  const { data: users } = useUsers({ limit: 100 });

  const createMut = useCreateTerritory();
  const updateMut = useUpdateTerritory();
  const deleteMut = useDeleteTerritory();

  const ownerName = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users?.data ?? []) {
      map.set(u.id, `${u.firstName} ${u.lastName}`.trim() || u.email);
    }
    return (id: string) => map.get(id) ?? id;
  }, [users]);

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (t: Territory) => {
    setEditing(t);
    setShowForm(true);
  };

  const handleSubmit = async (input: TerritoryInput) => {
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, data: input });
    } else {
      await createMut.mutateAsync(input);
    }
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm('Delete this territory? It will be deactivated.', 'Delete Territory'))) return;
    await deleteMut.mutateAsync(id);
    if (selectedId === id) setSelectedId(null);
  };

  const list = territories ?? [];

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Territories</h1>
          <p className="mt-1 text-sm text-gray-500">
            Rule-based routing of leads and accounts to owners
          </p>
        </div>
        {isAdmin && tab === 'territories' ? (
          <Button onClick={openCreate}>+ New Territory</Button>
        ) : null}
      </div>

      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {([
          ['territories', 'Territories'],
          ['routing-logs', 'Routing Logs'],
          ['test', 'Test Assignment'],
        ] as [Tab, string][]).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === value
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'territories' ? (
        isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon="⚠️"
            title="Couldn't load territories"
            description="The territory service may be unavailable."
            cta={{ label: 'Retry', onClick: () => void refetch() }}
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon="🗺️"
            title="No territories yet"
            description="Create rule-based territories to automatically route leads and accounts to the right owners."
            cta={isAdmin ? { label: '+ Add Territory', onClick: openCreate } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
              {list.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`rounded-xl border bg-white p-5 text-left transition-shadow hover:shadow-sm ${
                    selectedId === t.id ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-gray-200'
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-gray-900">{t.name}</h3>
                    <div className="flex shrink-0 gap-1">
                      {t.isDefault ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          Default
                        </span>
                      ) : null}
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">
                        {TYPE_LABEL[t.type] ?? t.type}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-gray-900">{t.priority}</p>
                      <p className="text-xs text-gray-500">Priority</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900">{t.ownerIds?.length ?? 0}</p>
                      <p className="text-xs text-gray-500">Owners</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900">
                        {t.ruleCount ?? t.rules?.length ?? 0}
                      </p>
                      <p className="text-xs text-gray-500">Rules</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="lg:col-span-1">
              {detail ? (
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{detail.name}</h3>
                      <p className="text-sm text-gray-500">
                        {TYPE_LABEL[detail.type] ?? detail.type} · priority {detail.priority}
                      </p>
                    </div>
                    {isAdmin ? (
                      <div className="flex gap-1">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(detail)}>
                          Edit
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleDelete(detail.id)}>
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {detail.description ? (
                    <p className="mb-3 text-sm text-gray-600">{detail.description}</p>
                  ) : null}

                  <div className="mb-4">
                    <p className="mb-1 text-xs font-medium uppercase text-gray-400">
                      Owners{' '}
                      {(detail.ownerIds?.length ?? 0) > 1 ? '(round-robin)' : ''}
                    </p>
                    {detail.ownerIds?.length ? (
                      <ul className="space-y-1 text-sm text-gray-700">
                        {detail.ownerIds.map((id) => (
                          <li key={id} className="rounded bg-gray-50 px-2 py-1">
                            {ownerName(id)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-400">No owners assigned</p>
                    )}
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-gray-400">Rules</p>
                    {detail.rules?.length ? (
                      <ul className="space-y-1 text-sm">
                        {detail.rules.map((r, i) => (
                          <li
                            key={r.id ?? i}
                            className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1 font-mono text-xs text-gray-700"
                          >
                            <span className="font-semibold">{r.field}</span>
                            <span className="text-indigo-600">{r.operator}</span>
                            <span>{r.value}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-400">
                        No rules — matches only via default fallback.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
                  Select a territory to view its rules and owners.
                </div>
              )}
            </div>
          </div>
        )
      ) : null}

      {tab === 'routing-logs' ? <RoutingLogsPanel /> : null}
      {tab === 'test' ? <TestAssignmentPanel /> : null}

      <TerritoryFormModal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        isSaving={createMut.isPending || updateMut.isPending}
        initial={editing}
      />

      {ConfirmDialog}
    </div>
  );
}
