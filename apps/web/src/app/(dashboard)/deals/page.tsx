'use client';

import { useEffect, useMemo, useState } from 'react';
import { useConfirm } from '@/hooks/use-confirm';
import Link from 'next/link';
import type { Stage } from '@nexus/shared-types';
import { LayoutGrid, List, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { PipelineBoard } from '@/components/deals/pipeline-board';
import { ExportButton } from '@/components/export/ExportButton';
import { ImportButton } from '@/components/export/ImportButton';
import { EmptyState as SharedEmptyState } from '@/components/ui/EmptyState';
import { SavedViewsControl } from '@/components/crm/SavedViewsControl';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Avatar } from '@/components/ui/avatar';
import { FilterBar } from '@/components/ui/filter-bar';
import { usePipelines, useStages } from '@/hooks/use-pipelines';
import { useDeals, useDeleteDeal, useUpdateDeal } from '@/hooks/use-deals';
import { useUsers } from '@/hooks/use-users';
import { usePipelineStore } from '@/stores/pipeline.store';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useColumnVisibility } from '@/components/ui/column-chooser';
import { EditableCell, EditableSelectCell } from '@/components/ui/editable-cell';

const statusLabelMap: Record<string, string> = {
  OPEN: 'IN PROGRESS',
  WON: 'CLOSED WON',
  LOST: 'CLOSED LOST',
  DORMANT: 'PENDING',
};

export default function DealsPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline');
  const [stageFilter, setStageFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [search, setSearch] = useState('');
  const [renewalsOnly, setRenewalsOnly] = useState(false);
  const [expiringSoon, setExpiringSoon] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const dealCols = useColumnVisibility('deals', [
    { key: 'name', label: 'Deal Name' },
    { key: 'account', label: 'Company' },
    { key: 'stage', label: 'Stage' },
    { key: 'amount', label: 'Amount' },
    { key: 'owner', label: 'Owner' },
    { key: 'status', label: 'Status' },
    { key: 'expectedCloseDate', label: 'Close Date' },
  ]);

  const pipelinesQuery = usePipelines();
  const activePipelineId = usePipelineStore((s) => s.activePipelineId);
  const setActivePipeline = usePipelineStore((s) => s.setActivePipeline);

  const pipelines = useMemo(() => pipelinesQuery.data ?? [], [pipelinesQuery.data]);
  const resolvedPipelineId = useMemo(() => {
    if (activePipelineId && pipelines.some((p) => p.id === activePipelineId)) {
      return activePipelineId;
    }
    return pipelines[0]?.id ?? null;
  }, [activePipelineId, pipelines]);

  useEffect(() => {
    if (resolvedPipelineId && resolvedPipelineId !== activePipelineId) {
      setActivePipeline(resolvedPipelineId);
    }
  }, [resolvedPipelineId, activePipelineId, setActivePipeline]);

  const stagesQuery = useStages(resolvedPipelineId);
  const stages: Stage[] = stagesQuery.data ?? [];

  // "Expiring soon" = contracts ending within the next 90 days. Memoized so
  // the ISO cutoff is stable across renders (it would otherwise change the
  // query key every render and refetch continuously).
  const contractEndBefore = useMemo(() => {
    if (!expiringSoon) return undefined;
    return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  }, [expiringSoon]);

  const dealsQuery = useDeals({
    pipelineId: resolvedPipelineId ?? undefined,
    stageId: stageFilter || undefined,
    ownerId: ownerFilter || undefined,
    search: search || undefined,
    isRenewal: renewalsOnly || undefined,
    contractEndBefore,
    page,
    limit: 25,
    sortBy: 'updatedAt',
    sortDir: 'desc',
  });

  const usersQuery = useUsers({ limit: 200 });
  const owners = usersQuery.data?.data ?? [];

  const deleteMutation = useDeleteDeal();
  const updateDeal = useUpdateDeal();

  const toggleSelection = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(dealsQuery.data?.data.map((d) => d.id) ?? []));
    } else {
      setSelectedIds(new Set());
    }
  };

  const isLoading = pipelinesQuery.isLoading || stagesQuery.isLoading || dealsQuery.isLoading;

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Deals</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Manage your pipeline and track deal progress
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ImportButton module="deals" onImported={() => void dealsQuery.refetch()} />
          <ExportButton module="deals" />
          <SavedViewsControl
            entityType="deal"
            currentFilters={{ search, stageId: stageFilter, ownerId: ownerFilter }}
            onApply={(f) => {
              setSearch(typeof f.search === 'string' ? f.search : '');
              setStageFilter(typeof f.stageId === 'string' ? f.stageId : '');
              setOwnerFilter(typeof f.ownerId === 'string' ? f.ownerId : '');
              setPage(1);
            }}
          />
          <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface)' }}>
            <button
              type="button"
              onClick={() => setView('pipeline')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
                view === 'pipeline' ? 'bg-primary-light text-primary' : 'text-on-surface-variant hover:text-on-surface'
              )}
              aria-pressed={view === 'pipeline'}
            >
              <LayoutGrid className="h-4 w-4" /> Pipeline
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
                view === 'list' ? 'bg-primary-light text-primary' : 'text-on-surface-variant hover:text-on-surface'
              )}
              aria-pressed={view === 'list'}
            >
              <List className="h-4 w-4" /> List
            </button>
          </div>
          {pipelines.length > 1 ? (
            <select
              value={resolvedPipelineId ?? ''}
              onChange={(e) => setActivePipeline(e.target.value)}
              className="h-9 rounded-lg border bg-transparent px-3 text-sm outline-none focus:border-primary"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          ) : null}
          <Link href="/deals/new">
            <Button type="button">New deal</Button>
          </Link>
        </div>
      </header>

      {view === 'list' ? (
        <div className="space-y-4">
          <FilterBar
            searchPlaceholder="Search deals..."
            searchValue={search}
            onSearchChange={(v) => { setSearch(v); setPage(1); }}
            onRefresh={() => dealsQuery.refetch()}
            filters={[
              {
                label: 'Stage',
                value: stageFilter,
                options: [{ label: 'All Stages', value: '' }, ...stages.map((s) => ({ label: s.name, value: s.id }))],
                onChange: (v) => { setStageFilter(v); setPage(1); },
              },
              {
                label: 'Owner',
                value: ownerFilter,
                options: [{ label: 'All Owners', value: '' }, ...owners.map((u) => ({ label: `${u.firstName} ${u.lastName}`, value: u.id }))],
                onChange: (v) => { setOwnerFilter(v); setPage(1); },
              },
            ]}
          />

          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              active={renewalsOnly}
              onClick={() => { setRenewalsOnly((v) => !v); setPage(1); }}
            >
              Renewals
            </FilterChip>
            <FilterChip
              active={expiringSoon}
              onClick={() => { setExpiringSoon((v) => !v); setPage(1); }}
            >
              Expiring in 90 days
            </FilterChip>
          </div>

          <DataTable
            data={dealsQuery.data?.data ?? []}
            keyExtractor={(row) => row.id}
            columns={[
              {
                key: 'name',
                header: 'Deal Name',
                cell: (row) => (
                  <EditableCell
                    value={row.name}
                    onSave={(v) => updateDeal.mutate({ id: row.id, data: { name: v } })}
                  >
                    <Link href={`/deals/${row.id}`} className="font-medium hover:text-primary hover:underline" style={{ color: 'var(--text-primary)' }}>
                      {row.name}
                    </Link>
                  </EditableCell>
                ),
              },
              {
                key: 'account',
                header: 'Company',
                cell: (row) => (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-container-high text-[10px] font-bold text-on-surface-variant dark:bg-surface-container-high dark:text-on-surface-variant">
                      {(row as unknown as Record<string, string>)['accountName']?.[0] ?? 'C'}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{(row as unknown as Record<string, string>)['accountName'] ?? '—'}</span>
                  </div>
                ),
              },
              {
                key: 'stage',
                header: 'Stage',
                cell: (row) => {
                  const stage = stages.find((s) => s.id === row.stageId);
                  return (
                    <EditableSelectCell
                      value={row.stageId}
                      options={stages.map((s) => ({ label: s.name, value: s.id }))}
                      onSave={(v) => updateDeal.mutate({ id: row.id, data: { stageId: v } })}
                    >
                      <span style={{ color: 'var(--text-secondary)' }}>{stage?.name ?? '—'}</span>
                    </EditableSelectCell>
                  );
                },
              },
              {
                key: 'amount',
                header: 'Amount',
                align: 'right',
                cell: (row) => (
                  <EditableCell
                    value={String(row.amount ?? 0)}
                    onSave={(v) => {
                      const num = Number(v);
                      if (!Number.isNaN(num)) {
                        updateDeal.mutate({ id: row.id, data: { amount: num } });
                      }
                    }}
                  >
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(row.amount, row.currency)}</span>
                  </EditableCell>
                ),
              },
              {
                key: 'owner',
                header: 'Owner',
                cell: (row) => {
                  const owner = owners.find((u) => u.id === row.ownerId);
                  const name = owner ? `${owner.firstName} ${owner.lastName}` : row.ownerId;
                  return (
                    <EditableSelectCell
                      value={row.ownerId}
                      options={owners.map((u) => ({ label: `${u.firstName} ${u.lastName}`, value: u.id }))}
                      onSave={(v) => updateDeal.mutate({ id: row.id, data: { ownerId: v } })}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar name={name} size="sm" />
                        <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
                      </div>
                    </EditableSelectCell>
                  );
                },
              },
              {
                key: 'status',
                header: 'Status',
                align: 'center',
                cell: (row) => (
                  <EditableSelectCell
                    value={row.status}
                    options={[
                      { label: 'IN PROGRESS', value: 'OPEN' },
                      { label: 'CLOSED WON', value: 'WON' },
                      { label: 'CLOSED LOST', value: 'LOST' },
                      { label: 'PENDING', value: 'DORMANT' },
                    ]}
                    onSave={(v) => updateDeal.mutate({ id: row.id, data: { status: v } })}
                  >
                    <StatusBadge status={statusLabelMap[row.status] ?? row.status} icon />
                  </EditableSelectCell>
                ),
              },
              {
                key: 'expectedCloseDate',
                header: 'Close Date',
                cell: (row) => (
                  <EditableCell
                    value={row.expectedCloseDate ? new Date(row.expectedCloseDate).toISOString().slice(0, 10) : ''}
                    onSave={(v) => updateDeal.mutate({ id: row.id, data: { expectedCloseDate: v ? new Date(v).toISOString() : undefined } })}
                  >
                    <span style={{ color: 'var(--text-muted)' }}>{formatDate(row.expectedCloseDate)}</span>
                  </EditableCell>
                ),
              },
            ]}
            loading={dealsQuery.isLoading}
            emptyState={
              <SharedEmptyState
                icon="🧭"
                title="No deals found"
                description="Try adjusting your filters or create a new deal."
              />
            }
            selectedIds={selectedIds}
            onSelect={toggleSelection}
            onSelectAll={toggleAll}
            bulkActions={
              <>
                <button
                  type="button"
                  onClick={async () => {
                    if (await confirm(`Delete ${selectedIds.size} deals?`, 'Delete Deals')) {
                      selectedIds.forEach((id) => deleteMutation.mutate(id));
                      setSelectedIds(new Set());
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-error hover:bg-error-container "
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIds(new Set());
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface-container-high dark:hover:bg-surface-container-highest"
                >
                  Clear
                </button>
              </>
            }
            pagination={
              dealsQuery.data
                ? {
                    page,
                    pageSize: 25,
                    total: dealsQuery.data.total,
                    onPageChange: setPage,
                  }
                : undefined
            }
            columnChooser={{
              allColumns: dealCols.allColumns,
              visibleKeys: dealCols.visibleKeys,
              onChange: dealCols.setVisibleKeys,
              onReset: dealCols.reset,
            }}
          />
        </div>
      ) : (
        <>
          {isLoading ? (
            <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border-color)' }}>
              <TableSkeleton rows={8} cols={5} />
            </div>
          ) : pipelinesQuery.isError ? (
            <ErrorBanner message="Failed to load pipelines. Try again." />
          ) : !resolvedPipelineId ? (
            <SharedEmptyState
              icon="🧭"
              title="No pipelines configured yet"
              description="Ask an administrator to create a pipeline in Settings."
            />
          ) : stagesQuery.isError ? (
            <ErrorBanner message="Failed to load stages for this pipeline." />
          ) : stages.length === 0 ? (
            <SharedEmptyState
              icon="🧱"
              title="This pipeline has no stages yet"
              description="Add stages in pipeline settings to start tracking deals."
            />
          ) : (
            <div className="-mx-4 overflow-x-auto px-4 rtl:flex-row-reverse" style={{ direction: 'inherit' }}>
              <div className="min-w-max pb-4">
                <PipelineBoard pipelineId={resolvedPipelineId} stages={stages} />
              </div>
            </div>
          )}
        </>
      )}
      {ConfirmDialog}
    </main>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
        active
          ? 'border-primary bg-primary-light text-primary'
          : 'border-[var(--border-color)] text-on-surface-variant hover:text-on-surface'
      )}
    >
      {children}
    </button>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-error/40 bg-error-container p-4 text-sm text-on-error-container "
    >
      {message}
    </div>
  );
}
