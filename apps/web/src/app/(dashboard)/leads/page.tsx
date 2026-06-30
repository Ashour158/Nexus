'use client';

import { useConfirm } from '@/hooks/use-confirm';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import Link from 'next/link';
import { useDeferredValue, useMemo, useState, type ReactElement } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Briefcase,
  CheckCircle2,
  Filter,
  GripVertical,
  LayoutGrid,
  ListChecks,
  MoreVertical,
  Search,
  Sparkles,
  Target,
  UserPlus,
  Users,
} from 'lucide-react';
import type { Lead, LeadStatusLiteral } from '@nexus/shared-types';
import type { UpdateLeadInput } from '@nexus/validation';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { api } from '@/lib/api-client';
import { notify } from '@/lib/toast';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import {
  useConvertLead,
  useLeads,
  useUpdateLead,
  useUpdateLeadStatus,
} from '@/hooks/use-leads';
import { useUsers } from '@/hooks/use-users';
import { TableSkeleton } from '@/components/ui/skeleton';
import { SavedViewsSidebar } from '@/components/saved-views-sidebar';
import { ExportButton } from '@/components/export/ExportButton';
import { ImportButton } from '@/components/export/ImportButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ColumnChooser, useColumnVisibility } from '@/components/ui/column-chooser';
import { EditableCell, EditableSelectCell } from '@/components/ui/editable-cell';

const STATUS_COLUMNS: Array<{ id: LeadStatusLiteral; label: string; hint: string }> = [
  { id: 'NEW', label: 'New', hint: 'Fresh capture' },
  { id: 'ASSIGNED', label: 'Contacted', hint: 'Owner assigned' },
  { id: 'WORKING', label: 'Working', hint: 'Active follow-up' },
  { id: 'QUALIFIED', label: 'Qualified', hint: 'Ready to convert' },
  { id: 'CONVERTED', label: 'Converted', hint: 'CRM record created' },
  { id: 'UNQUALIFIED', label: 'Disqualified', hint: 'Closed out' },
];

const STATUS_OPTIONS = STATUS_COLUMNS.map((status) => ({
  label: status.label,
  value: status.id,
}));

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500 text-white';
  if (score >= 60) return 'bg-amber-500 text-white';
  if (score >= 40) return 'bg-orange-500 text-white';
  return 'bg-slate-400 text-white';
}

function statusClass(status: LeadStatusLiteral): string {
  if (status === 'CONVERTED') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'QUALIFIED') return 'bg-blue-50 text-blue-700 ring-blue-200';
  if (status === 'UNQUALIFIED') return 'bg-rose-50 text-rose-700 ring-rose-200';
  if (status === 'WORKING') return 'bg-amber-50 text-amber-700 ring-amber-200';
  return 'bg-slate-100 text-slate-700 ring-slate-200';
}

function displayName(lead: Lead): string {
  return `${lead.firstName} ${lead.lastName}`.trim();
}

function initials(lead: Lead): string {
  return `${lead.firstName?.[0] ?? ''}${lead.lastName?.[0] ?? ''}`.toUpperCase() || 'LD';
}

function LeadCard({ lead }: { lead: Lead }): ReactElement {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lead.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'cursor-grab rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md',
        isDragging && 'opacity-50'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-black text-[#005baf]">
          {initials(lead)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-slate-950">{displayName(lead)}</div>
          <div className="truncate text-xs text-slate-500">{lead.company ?? 'No account yet'}</div>
        </div>
        <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className={cn('inline-flex h-7 min-w-9 items-center justify-center rounded px-2 text-xs font-black', scoreColor(lead.score))}>
          {lead.score}
        </span>
        <span className="truncate text-xs font-medium text-slate-400">{lead.source ?? 'OTHER'}</span>
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  label,
  hint,
  leads,
  canDrag,
}: {
  status: LeadStatusLiteral;
  label: string;
  hint: string;
  leads: Lead[];
  canDrag: boolean;
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[520px] w-80 shrink-0 flex-col rounded-xl border bg-slate-50 p-3',
        isOver ? 'border-[#137fec] bg-blue-50' : 'border-slate-200'
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div>
          <div className="text-sm font-black text-slate-950">{label}</div>
          <div className="mt-0.5 text-xs text-slate-500">{hint}</div>
        </div>
        <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-500 shadow-sm">
          {leads.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {leads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 p-6 text-center text-xs text-slate-400">
            Drop leads here
          </div>
        ) : canDrag ? (
          leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
        ) : (
          leads.map((lead) => (
            <div key={lead.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <div className="truncate font-bold text-slate-950">{displayName(lead)}</div>
              <div className="truncate text-xs text-slate-500">{lead.company ?? 'No account yet'}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function LeadsPage(): ReactElement {
  const viewMode = useUiStore((s) => s.leadsViewMode);
  const setViewMode = useUiStore((s) => s.setLeadsViewMode);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const qc = useQueryClient();
  const { confirm, ConfirmDialog } = useConfirm();

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<'ALL' | LeadStatusLiteral>('ALL');
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [convertTarget, setConvertTarget] = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [massOwnerId, setMassOwnerId] = useState('');

  const { data, isLoading, isError, error, refetch } = useLeads({
    limit: viewMode === 'kanban' ? 120 : 75,
    sortBy: 'createdAt',
    sortDir: 'desc',
  });
  const users = useUsers();
  const updateLead = useUpdateLead();
  const updateStatus = useUpdateLeadStatus();
  const convertLead = useConvertLead();

  const leadCols = useColumnVisibility('leads', [
    { key: 'name', label: 'Name' },
    { key: 'company', label: 'Company' },
    { key: 'score', label: 'Score' },
    { key: 'status', label: 'Status' },
    { key: 'source', label: 'Source' },
    { key: 'owner', label: 'Owner' },
    { key: 'created', label: 'Created' },
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const allLeads = useMemo(() => data?.data ?? [], [data?.data]);
  const leads = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return allLeads.filter((lead) => {
      const matchesStatus = statusFilter === 'ALL' || lead.status === statusFilter;
      if (!matchesStatus) return false;
      if (!q) return true;
      return [
        displayName(lead),
        lead.email,
        lead.phone,
        lead.company,
        lead.jobTitle,
        lead.source,
        lead.code,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [allLeads, deferredSearch, statusFilter]);

  const stats = useMemo(() => {
    const total = data?.total ?? allLeads.length;
    const qualified = allLeads.filter((lead) => lead.status === 'QUALIFIED').length;
    const working = allLeads.filter((lead) => lead.status === 'WORKING').length;
    const converted = allLeads.filter((lead) => lead.status === 'CONVERTED').length;
    const averageScore = allLeads.length
      ? Math.round(allLeads.reduce((sum, lead) => sum + (lead.score ?? 0), 0) / allLeads.length)
      : 0;
    return { total, qualified, working, converted, averageScore };
  }, [allLeads, data?.total]);

  const columns = useMemo(() => {
    const byStatus = new Map<LeadStatusLiteral, Lead[]>();
    for (const col of STATUS_COLUMNS) byStatus.set(col.id, []);
    for (const lead of leads) {
      byStatus.get(lead.status as LeadStatusLiteral)?.push(lead);
    }
    return byStatus;
  }, [leads]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const canUpdate = hasPermission('leads:update');
  const canConvert = hasPermission('leads:convert') || hasPermission('leads:update');

  function onDragStart(event: DragStartEvent) {
    setActiveLead(leads.find((lead) => lead.id === event.active.id) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveLead(null);
    if (!event.over || !canUpdate) return;
    const id = String(event.active.id);
    const target = event.over.id as LeadStatusLiteral;
    const lead = leads.find((item) => item.id === id);
    if (!lead || lead.status === target) return;
    updateStatus.mutate(
      { id, status: target },
      { onError: (err) => notify.error('Failed to move lead', err.message) }
    );
  }

  function onConfirmConvert() {
    if (!convertTarget) return;
    convertLead.mutate(
      { id: convertTarget.id },
      {
        onSuccess: () => {
          notify.success('Lead converted');
          setConvertTarget(null);
        },
        onError: (err) => notify.error('Conversion failed', err.message),
      }
    );
  }

  async function runMassOwnerChange() {
    if (!massOwnerId || selectedIds.length === 0) return;
    try {
      await api.patch('/leads/mass-update', { ids: selectedIds, data: { ownerId: massOwnerId } });
      setSelectedIds([]);
      setMassOwnerId('');
      notify.success('Leads reassigned');
      await qc.invalidateQueries({ queryKey: ['leads'] });
    } catch (err) {
      notify.error('Failed to reassign leads', err instanceof Error ? err.message : undefined);
    }
  }

  async function runMassDelete() {
    if (selectedIds.length === 0) return;
    if (!await confirm(`Delete ${selectedIds.length} leads?`, 'Delete Leads')) return;
    try {
      await api.delete('/leads/mass-delete', { data: { ids: selectedIds } });
      setSelectedIds([]);
      notify.success('Leads deleted');
      await qc.invalidateQueries({ queryKey: ['leads'] });
    } catch (err) {
      notify.error('Failed to delete leads', err instanceof Error ? err.message : undefined);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="grid lg:grid-cols-[1fr_360px]">
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#005baf]">
                <Target className="h-4 w-4" />
                Lead command center
              </span>
              <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
                Codes, routing, scoring, conversion
              </span>
            </div>
            <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Leads
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
              Capture prospects, qualify intent, assign ownership, and convert cleanly into accounts, contacts, and deals.
            </p>
          </div>
          <div className="border-t border-slate-100 bg-slate-50 p-5 lg:border-l lg:border-t-0">
            <div className="grid grid-cols-2 gap-3">
              <MetricCard icon={Users} label="Total leads" value={stats.total.toLocaleString()} note={`${leads.length} visible`} />
              <MetricCard icon={CheckCircle2} label="Qualified" value={stats.qualified.toLocaleString()} note="ready handoff" />
              <MetricCard icon={ListChecks} label="Working" value={stats.working.toLocaleString()} note="active follow-up" />
              <MetricCard icon={Sparkles} label="Avg score" value={String(stats.averageScore)} note={`${stats.converted} converted`} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <SavedViewsSidebar
            module="lead"
            onViewSelect={(view) => {
              const filters = view.filters ?? {};
              setSearch(typeof filters.search === 'string' ? filters.search : '');
            }}
            currentFilters={{ search, status: statusFilter }}
            currentColumns={leadCols.visibleKeys}
          />
        </aside>

        <div className="min-w-0 space-y-5">
          <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={cn(
                    'rounded-lg px-4 py-2 text-sm font-bold transition',
                    statusFilter === 'ALL'
                      ? 'bg-[#137fec] text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-[#005baf]'
                  )}
                >
                  All
                </button>
                {STATUS_COLUMNS.map((status) => (
                  <button
                    key={status.id}
                    type="button"
                    onClick={() => setStatusFilter(status.id)}
                    className={cn(
                      'rounded-lg px-4 py-2 text-sm font-bold transition',
                      statusFilter === status.id
                        ? 'bg-[#137fec] text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-blue-50 hover:text-[#005baf]'
                    )}
                  >
                    {status.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <label className="relative block min-w-0 lg:w-80">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, company, email, code..."
                    className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <ColumnChooser
                    allColumns={leadCols.allColumns}
                    visibleKeys={leadCols.visibleKeys}
                    onChange={leadCols.setVisibleKeys}
                    onReset={leadCols.reset}
                  />
                  <ImportButton module="leads" onImported={() => void refetch()} />
                  <ExportButton module="leads" filters={{ search, status: statusFilter }} />
                  <Link
                    href="/leads/new"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#137fec] px-4 text-sm font-bold text-white transition hover:bg-[#005baf]"
                  >
                    <UserPlus className="h-4 w-4" />
                    New Lead
                  </Link>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-10 items-center gap-2 px-4 text-sm font-bold',
                    viewMode === 'table' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'
                  )}
                  onClick={() => setViewMode('table')}
                >
                  <BarChart3 className="h-4 w-4" />
                  Table
                </button>
                <button
                  type="button"
                  className={cn(
                    'inline-flex h-10 items-center gap-2 px-4 text-sm font-bold',
                    viewMode === 'kanban' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'
                  )}
                  onClick={() => setViewMode('kanban')}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Kanban
                </button>
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                <Filter className="h-4 w-4" />
                {statusFilter === 'ALL' ? 'All statuses' : STATUS_COLUMNS.find((item) => item.id === statusFilter)?.label}
              </div>
            </div>
          </section>

          {isLoading ? (
            <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
              <TableSkeleton rows={8} cols={8} />
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
              Failed to load leads: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          ) : leads.length === 0 ? (
            <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
              <EmptyState
                icon="target"
                title="No leads match this view"
                description="Adjust the filters, import leads, or create a new lead to start the pipeline."
                cta={{ label: 'Add Lead', href: '/leads/new' }}
                secondaryCta={{ label: 'Import CSV', href: '/settings/migration' }}
              />
            </div>
          ) : viewMode === 'kanban' ? (
            <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
              <div className="flex gap-4 overflow-x-auto rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                {STATUS_COLUMNS.map((column) => (
                  <KanbanColumn
                    key={column.id}
                    status={column.id}
                    label={column.label}
                    hint={column.hint}
                    leads={columns.get(column.id) ?? []}
                    canDrag={canUpdate}
                  />
                ))}
              </div>
              <DragOverlay>{activeLead ? <LeadCard lead={activeLead} /> : null}</DragOverlay>
            </DndContext>
          ) : (
            <LeadTable
              leads={leads}
              selectedSet={selectedSet}
              selectedIds={selectedIds}
              setSelectedIds={setSelectedIds}
              massOwnerId={massOwnerId}
              setMassOwnerId={setMassOwnerId}
              users={users.data?.data ?? []}
              onMassOwnerChange={runMassOwnerChange}
              onMassDelete={runMassDelete}
              visibleColumns={leadCols.visibleKeys}
              updateLead={(id, update) => updateLead.mutate({ id, data: update })}
              canConvert={canConvert}
              setConvertTarget={setConvertTarget}
            />
          )}
        </div>
      </div>

      {ConfirmDialog}
      {convertTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-[#005baf]">
              <Briefcase className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-xl font-black text-slate-950">Convert lead?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This will create linked CRM records for <span className="font-bold">{displayName(convertTarget)}</span> and mark the lead as converted.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                onClick={() => setConvertTarget(null)}
                disabled={convertLead.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#137fec] px-4 py-2 text-sm font-bold text-white hover:bg-[#005baf] disabled:opacity-60"
                onClick={onConfirmConvert}
                disabled={convertLead.isPending}
              >
                {convertLead.isPending ? 'Converting...' : 'Convert'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 inline-flex rounded-lg bg-blue-50 p-2 text-[#005baf]">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}

function LeadTable({
  leads,
  selectedSet,
  selectedIds,
  setSelectedIds,
  massOwnerId,
  setMassOwnerId,
  users,
  onMassOwnerChange,
  onMassDelete,
  visibleColumns,
  updateLead,
  canConvert,
  setConvertTarget,
}: {
  leads: Lead[];
  selectedSet: Set<string>;
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  massOwnerId: string;
  setMassOwnerId: (value: string) => void;
  users: Array<{ id: string; firstName: string; lastName: string }>;
  onMassOwnerChange: () => Promise<void>;
  onMassDelete: () => Promise<void>;
  visibleColumns: string[];
  updateLead: (id: string, update: UpdateLeadInput) => void;
  canConvert: boolean;
  setConvertTarget: (lead: Lead) => void;
}) {
  return (
    <div className="space-y-3">
      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm shadow-sm">
          <span className="font-bold text-[#005baf]">{selectedIds.length} selected</span>
          <select
            className="h-9 rounded-lg border border-blue-100 bg-white px-3 text-xs text-slate-700 outline-none"
            value={massOwnerId}
            onChange={(event) => setMassOwnerId(event.target.value)}
          >
            <option value="">Change owner</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.firstName} {user.lastName}
              </option>
            ))}
          </select>
          <button type="button" className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700" onClick={() => void onMassOwnerChange()}>
            Change Owner
          </button>
          <button type="button" className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-rose-600" onClick={() => void onMassDelete()}>
            Delete
          </button>
          <button type="button" className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-500" onClick={() => setSelectedIds([])}>
            Clear
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="w-12 px-5 py-3">
                  <input
                    type="checkbox"
                    checked={leads.length > 0 && selectedIds.length === leads.length}
                    onChange={(event) => setSelectedIds(event.target.checked ? leads.map((lead) => lead.id) : [])}
                    aria-label="Select all leads"
                  />
                </th>
                {visibleColumns.includes('name') ? <th className="px-5 py-3">Lead</th> : null}
                {visibleColumns.includes('company') ? <th className="px-5 py-3">Company</th> : null}
                {visibleColumns.includes('score') ? <th className="px-5 py-3">Score</th> : null}
                {visibleColumns.includes('status') ? <th className="px-5 py-3">Status</th> : null}
                {visibleColumns.includes('source') ? <th className="px-5 py-3">Source</th> : null}
                {visibleColumns.includes('owner') ? <th className="px-5 py-3">Owner</th> : null}
                {visibleColumns.includes('created') ? <th className="px-5 py-3">Created</th> : null}
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="transition hover:bg-slate-50/80">
                  <td className="px-5 py-4">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(lead.id)}
                      onChange={(event) => {
                        setSelectedIds((prev) =>
                          event.target.checked ? [...prev, lead.id] : prev.filter((id) => id !== lead.id)
                        );
                      }}
                      aria-label={`Select ${displayName(lead)}`}
                    />
                  </td>
                  {visibleColumns.includes('name') ? (
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-black text-[#005baf]">
                          {initials(lead)}
                        </div>
                        <div className="min-w-0">
                          <Link href={`/leads/${lead.id}`} className="block truncate font-bold text-slate-950 hover:text-[#005baf]">
                            {displayName(lead)}
                          </Link>
                          <p className="mt-0.5 truncate text-xs text-slate-500">{lead.email ?? lead.code ?? 'No email'}</p>
                        </div>
                      </div>
                    </td>
                  ) : null}
                  {visibleColumns.includes('company') ? (
                    <td className="px-5 py-4 text-slate-600">
                      <EditableCell value={lead.company ?? ''} onSave={(value) => updateLead(lead.id, { company: value || undefined })}>
                        {lead.company ?? 'No company'}
                      </EditableCell>
                    </td>
                  ) : null}
                  {visibleColumns.includes('score') ? (
                    <td className="px-5 py-4">
                      <EditableCell
                        value={String(lead.score ?? 0)}
                        onSave={(value) => {
                          const next = Number(value);
                          if (!Number.isNaN(next)) updateLead(lead.id, { score: next });
                        }}
                      >
                        <span className={cn('inline-flex h-7 min-w-9 items-center justify-center rounded px-2 text-xs font-black', scoreColor(lead.score))}>
                          {lead.score}
                        </span>
                      </EditableCell>
                    </td>
                  ) : null}
                  {visibleColumns.includes('status') ? (
                    <td className="px-5 py-4">
                      <EditableSelectCell
                        value={lead.status}
                        options={STATUS_OPTIONS}
                        onSave={(value) => updateLead(lead.id, { status: value as LeadStatusLiteral })}
                      >
                        <span className={cn('inline-flex rounded px-2.5 py-1 text-xs font-bold ring-1', statusClass(lead.status))}>
                          {lead.status}
                        </span>
                      </EditableSelectCell>
                    </td>
                  ) : null}
                  {visibleColumns.includes('source') ? (
                    <td className="px-5 py-4 text-slate-600">
                      <EditableCell value={lead.source ?? ''} onSave={(value) => updateLead(lead.id, { source: (value || undefined) as UpdateLeadInput['source'] })}>
                        {lead.source ?? 'OTHER'}
                      </EditableCell>
                    </td>
                  ) : null}
                  {visibleColumns.includes('owner') ? (
                    <td className="px-5 py-4 text-slate-600">
                      <EditableSelectCell
                        value={lead.ownerId ?? ''}
                        options={users.map((user) => ({ label: `${user.firstName} ${user.lastName}`, value: user.id }))}
                        onSave={(value) => updateLead(lead.id, { ownerId: value })}
                      >
                        {lead.ownerId ? lead.ownerId : 'Unassigned'}
                      </EditableSelectCell>
                    </td>
                  ) : null}
                  {visibleColumns.includes('created') ? (
                    <td className="px-5 py-4 text-slate-500">{formatDate(lead.createdAt)}</td>
                  ) : null}
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      {canConvert && lead.status !== 'CONVERTED' ? (
                        <button
                          type="button"
                          onClick={() => setConvertTarget(lead)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-blue-50 hover:text-[#005baf]"
                        >
                          Convert
                        </button>
                      ) : null}
                      <button type="button" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="More actions">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
