'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Map as MapIcon, MapPin } from 'lucide-react';
import {
  CRMEmptyState,
  CRMErrorState,
  CRMModuleShell,
  CRMPageHeader,
  CRMSegmentedControl,
  CRMSidePanel,
  CRMStatusBadge,
  CRMToolbar,
} from '@/components/ui/crm';
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
    <CRMModuleShell>
      <CRMPageHeader
        icon={MapIcon}
        title="Territories"
        description="Rule-based routing of leads and accounts to owners"
        actions={isAdmin && tab === 'territories' ? (
          <Button onClick={openCreate}>+ New Territory</Button>
        ) : null}
      />
      <CRMToolbar>
        <CRMSegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'territories', label: 'Territories' },
            { value: 'routing-logs', label: 'Routing Logs' },
            { value: 'test', label: 'Test Assignment' },
          ]}
        />
      </CRMToolbar>

      {tab === 'territories' ? (
        isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-surface-container-high" />
            ))}
          </div>
        ) : isError ? (
          <CRMErrorState
            title="Couldn't load territories"
            description="The territory service may be unavailable."
            action={<Button onClick={() => void refetch()}>Retry</Button>}
          />
        ) : list.length === 0 ? (
          <CRMEmptyState
            icon={MapIcon}
            title="No territories yet"
            description="Create rule-based territories to automatically route leads and accounts to the right owners."
            action={isAdmin ? <Button onClick={openCreate}>+ Add Territory</Button> : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
              {list.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`rounded-xl border bg-surface p-5 text-left transition-shadow hover:shadow-sm ${
                    selectedId === t.id ? 'border-primary ring-1 ring-primary/30' : 'border-outline-variant'
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-on-surface">{t.name}</h3>
                    <div className="flex shrink-0 gap-1">
                      {t.isDefault ? (
                        <CRMStatusBadge tone="amber">
                          Default
                        </CRMStatusBadge>
                      ) : null}
                      <CRMStatusBadge tone="blue">
                        {TYPE_LABEL[t.type] ?? t.type}
                      </CRMStatusBadge>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-on-surface">{t.priority}</p>
                      <p className="text-xs text-on-surface-variant">Priority</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-on-surface">{t.ownerIds?.length ?? 0}</p>
                      <p className="text-xs text-on-surface-variant">Owners</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-on-surface">
                        {t.ruleCount ?? t.rules?.length ?? 0}
                      </p>
                      <p className="text-xs text-on-surface-variant">Rules</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="lg:col-span-1">
              {detail ? (
                <CRMSidePanel title={detail.name} description={`${TYPE_LABEL[detail.type] ?? detail.type} · priority ${detail.priority}`}>
                  <div className="mb-3 flex items-start justify-between">
                    <div />
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
                    <p className="mb-3 text-sm text-on-surface-variant">{detail.description}</p>
                  ) : null}

                  <div className="mb-4">
                    <p className="mb-1 text-xs font-medium uppercase text-on-surface-variant">
                      Owners{' '}
                      {(detail.ownerIds?.length ?? 0) > 1 ? '(round-robin)' : ''}
                    </p>
                    {detail.ownerIds?.length ? (
                      <ul className="space-y-1 text-sm text-on-surface">
                        {detail.ownerIds.map((id) => (
                          <li key={id} className="rounded bg-surface-container-low px-2 py-1">
                            {ownerName(id)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-on-surface-variant">No owners assigned</p>
                    )}
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-on-surface-variant">Rules</p>
                    {detail.rules?.length ? (
                      <ul className="space-y-1 text-sm">
                        {detail.rules.map((r, i) => (
                          <li
                            key={r.id ?? i}
                            className="flex items-center gap-2 rounded bg-surface-container-low px-2 py-1 font-mono text-xs text-on-surface"
                          >
                            <span className="font-semibold">{r.field}</span>
                            <span className="text-primary">{r.operator}</span>
                            <span>{r.value}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-on-surface-variant">
                        No rules — matches only via default fallback.
                      </p>
                    )}
                  </div>
                </CRMSidePanel>
              ) : (
                <CRMEmptyState icon={MapPin} title="Select a territory to view its rules and owners." />
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
    </CRMModuleShell>
  );
}
