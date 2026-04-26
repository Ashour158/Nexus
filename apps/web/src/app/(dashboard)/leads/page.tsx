'use client';

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
import { useMemo, useState, type ReactElement } from 'react';
import type { Lead, LeadStatusLiteral } from '@nexus/shared-types';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import {
  useConvertLead,
  useLeads,
  useUpdateLeadStatus,
} from '@/hooks/use-leads';
import { useUsers } from '@/hooks/use-users';
import { TableSkeleton } from '@/components/ui/skeleton';
import { SavedViewsSidebar } from '@/components/saved-views-sidebar';

/**
 * Leads page — table + kanban with drag-drop status transitions and a
 * one-click "Convert" action that opens a confirmation modal.
 */

const STATUS_COLUMNS: Array<{ id: LeadStatusLiteral; label: string }> = [
  { id: 'NEW', label: 'New' },
  { id: 'ASSIGNED', label: 'Contacted' },
  { id: 'WORKING', label: 'Working' },
  { id: 'QUALIFIED', label: 'Qualified' },
  { id: 'CONVERTED', label: 'Converted' },
  { id: 'UNQUALIFIED', label: 'Disqualified' },
];

function scoreColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-500';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-slate-400';
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
        'cursor-grab rounded-md border border-slate-200 bg-white p-3 shadow-sm hover:shadow',
        isDragging && 'opacity-50'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900">
            {lead.firstName} {lead.lastName}
          </div>
          <div className="truncate text-xs text-slate-500">
            {lead.company ?? '—'}
          </div>
        </div>
        <span
          className={cn(
            'inline-flex h-6 min-w-[2rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white',
            scoreColor(lead.score)
          )}
        >
          {lead.score}
        </span>
      </div>
      <div className="mt-2 text-[11px] text-slate-400">
        {lead.source ?? 'direct'} · {formatDate(lead.createdAt)}
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  label,
  leads,
  canDrag,
}: {
  status: LeadStatusLiteral;
  label: string;
  leads: Lead[];
  canDrag: boolean;
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[400px] w-72 shrink-0 flex-col rounded-lg border bg-slate-50 p-3',
        isOver ? 'border-slate-900 bg-slate-100' : 'border-slate-200'
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">
          {leads.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {leads.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
            Drop leads here
          </div>
        ) : canDrag ? (
          leads.map((l) => <LeadCard key={l.id} lead={l} />)
        ) : (
          leads.map((l) => (
            <div
              key={l.id}
              className="rounded-md border border-slate-200 bg-white p-3 text-sm"
            >
              <div className="truncate font-medium text-slate-900">
                {l.firstName} {l.lastName}
              </div>
              <div className="truncate text-xs text-slate-500">
                {l.company ?? '—'}
              </div>
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
  const pushToast = useUiStore((s) => s.pushToast);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const { data, isLoading, isError, error } = useLeads({ limit: 200 });
  const users = useUsers();
  const updateStatus = useUpdateLeadStatus();
  const convertLead = useConvertLead();

  const [search, setSearch] = useState('');
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [convertTarget, setConvertTarget] = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [massOwnerId, setMassOwnerId] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const leads = useMemo(() => {
    const all = data?.data ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(
      (l) =>
        `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.company?.toLowerCase().includes(q)
    );
  }, [data, search]);

  const columns = useMemo(() => {
    const byStatus = new Map<LeadStatusLiteral, Lead[]>();
    for (const col of STATUS_COLUMNS) byStatus.set(col.id, []);
    for (const l of leads) {
      const bucket = byStatus.get(l.status as LeadStatusLiteral);
      if (bucket) bucket.push(l);
    }
    return byStatus;
  }, [leads]);

  const canUpdate = hasPermission('leads:update');
  const canConvert = hasPermission('leads:convert') || hasPermission('leads:update');

  function onDragStart(e: DragStartEvent) {
    const l = leads.find((x) => x.id === e.active.id);
    setActiveLead(l ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveLead(null);
    if (!e.over || !canUpdate) return;
    const id = String(e.active.id);
    const target = e.over.id as LeadStatusLiteral;
    const lead = leads.find((x) => x.id === id);
    if (!lead || lead.status === target) return;
    updateStatus.mutate(
      { id, status: target },
      {
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Failed to move lead',
            description: err.message,
          }),
      }
    );
  }

  function onConfirmConvert() {
    if (!convertTarget) return;
    convertLead.mutate(
      { id: convertTarget.id },
      {
        onSuccess: () => {
          pushToast({
            variant: 'success',
            title: 'Lead converted',
            description: `${convertTarget.firstName} ${convertTarget.lastName} is now a contact.`,
          });
          setConvertTarget(null);
        },
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Conversion failed',
            description: err.message,
          }),
      }
    );
  }

  async function runMassOwnerChange() {
    if (!massOwnerId || selectedIds.length === 0) return;
    await api.patch('/leads/mass-update', { ids: selectedIds, data: { ownerId: massOwnerId } });
    setSelectedIds([]);
    setMassOwnerId('');
    window.location.reload();
  }

  async function runMassDelete() {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} leads?`)) return;
    await api.delete('/leads/mass-delete', { data: { ids: selectedIds } });
    setSelectedIds([]);
    window.location.reload();
  }

  return (
    <div className="space-y-4 lg:flex lg:gap-4 lg:space-y-0">
      <SavedViewsSidebar
        module="lead"
        onViewSelect={(v) => {
          const filters = v.filters ?? {};
          setSearch(typeof filters.search === 'string' ? filters.search : '');
        }}
      />
      <div className="min-w-0 flex-1 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Leads</h1>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, company…"
            className="h-9 w-64 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
          />
          <div className="inline-flex overflow-hidden rounded-md border border-slate-200">
            <button
              type="button"
              className={cn(
                'px-3 py-1.5 text-sm',
                viewMode === 'table'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              )}
              onClick={() => setViewMode('table')}
            >
              Table
            </button>
            <button
              type="button"
              className={cn(
                'px-3 py-1.5 text-sm',
                viewMode === 'kanban'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              )}
              onClick={() => setViewMode('kanban')}
            >
              Kanban
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <TableSkeleton rows={8} cols={8} />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load leads: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No leads yet. Start importing from your sources.
        </div>
      ) : viewMode === 'kanban' ? (
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STATUS_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                status={col.id}
                label={col.label}
                leads={columns.get(col.id) ?? []}
                canDrag={canUpdate}
              />
            ))}
          </div>
          <DragOverlay>
            {activeLead ? <LeadCard lead={activeLead} /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <>
        {selectedIds.length > 0 ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2 text-sm shadow">
            <span>{selectedIds.length} selected</span>
            <select className="h-8 rounded border border-slate-200 px-2 text-xs" value={massOwnerId} onChange={(e) => setMassOwnerId(e.target.value)}>
              <option value="">Change owner…</option>
              {(users.data?.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
            <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs" onClick={() => void runMassOwnerChange()}>Change Owner</button>
            <button type="button" className="rounded border border-red-200 px-2 py-1 text-xs text-red-700" onClick={() => void runMassDelete()}>Delete</button>
            <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs" onClick={() => setSelectedIds([])}>✕</button>
          </div>
        ) : null}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={leads.length > 0 && selectedIds.length === leads.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? leads.map((l) => l.id) : [])}
                  />
                </th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Score</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Owner</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(l.id)}
                      onChange={(e) => {
                        setSelectedIds((prev) =>
                          e.target.checked ? [...prev, l.id] : prev.filter((id) => id !== l.id)
                        );
                      }}
                    />
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-900">
                    <Link href={`/leads/${l.id}`} className="hover:underline">
                      {l.firstName} {l.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{l.company ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'inline-flex h-6 min-w-[2rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white',
                        scoreColor(l.score)
                      )}
                    >
                      {l.score}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{l.source ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {l.ownerId ? l.ownerId.slice(0, 6) : '—'}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {formatDate(l.createdAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {canConvert && l.status !== 'CONVERTED' ? (
                      <button
                        type="button"
                        onClick={() => setConvertTarget(l)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Convert
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {convertTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Convert lead?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              This will create a Contact, Account, and (optionally) a Deal for
              <span className="font-medium">
                {' '}
                {convertTarget.firstName} {convertTarget.lastName}
              </span>
              . The lead will be marked <code>CONVERTED</code>.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={() => setConvertTarget(null)}
                disabled={convertLead.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                onClick={onConfirmConvert}
                disabled={convertLead.isPending}
              >
                {convertLead.isPending ? 'Converting…' : 'Convert'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
