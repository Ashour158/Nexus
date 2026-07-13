'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Deal, Stage } from '@nexus/shared-types';
import { Avatar } from '@/components/ui/avatar';
import { formatCurrency, parseDecimal } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * Self-contained Kanban board for deals (Board view).
 *
 * Deliberately dependency-free: drag-and-drop uses the native HTML5 DnD API
 * (no dnd library), grouping/layout is CSS flex/grid, and it respects
 * `prefers-reduced-motion` (transitions are dropped via the `motion-reduce`
 * variant). Persistence + optimistic move/rollback is delegated to `onMove`
 * (the page wires this to the deal stage-update mutation). A per-card stage
 * `<select>` provides a fully keyboard-accessible fallback to dragging.
 */

export interface KanbanOwner {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  name?: string;
}

export interface KanbanBoardProps {
  stages: Stage[];
  deals: Deal[];
  owners: KanbanOwner[];
  /** Persist a stage change. Should be optimistic + rollback on error. */
  onMove: (dealId: string, stageId: string) => void;
  /** When false, drag + the stage select are disabled (read-only). */
  canMove?: boolean;
}

function ownerName(owners: KanbanOwner[], ownerId: string): string {
  const o = owners.find((u) => u.id === ownerId);
  if (!o) return 'Unassigned';
  return o.name || `${o.firstName ?? ''} ${o.lastName ?? ''}`.trim() || o.email || 'Unassigned';
}

export function KanbanBoard({ stages, deals, owners, onMove, canMove = true }: KanbanBoardProps): JSX.Element {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);

  const columns = useMemo(() => {
    const byStage = new Map<string, Deal[]>();
    for (const stage of stages) byStage.set(stage.id, []);
    for (const deal of deals) {
      const bucket = byStage.get(deal.stageId);
      if (bucket) bucket.push(deal);
    }
    return [...stages]
      .sort((a, b) => a.order - b.order)
      .map((stage) => {
        const columnDeals = byStage.get(stage.id) ?? [];
        const sum = columnDeals.reduce((acc, d) => acc + parseDecimal(d.amount), 0);
        const currency = columnDeals[0]?.currency ?? deals[0]?.currency ?? 'USD';
        return { stage, deals: columnDeals, sum, currency };
      });
  }, [stages, deals]);

  const handleDrop = (stageId: string) => {
    const id = draggingId;
    setOverStageId(null);
    setDraggingId(null);
    if (!canMove || !id) return;
    const deal = deals.find((d) => d.id === id);
    if (deal && deal.stageId !== stageId) onMove(id, stageId);
  };

  return (
    <div
      data-testid="kanban-board"
      className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 rtl:flex-row-reverse"
      style={{ direction: 'inherit' }}
    >
      {columns.map(({ stage, deals: columnDeals, sum, currency }) => {
        const isOver = overStageId === stage.id;
        return (
          <section
            key={stage.id}
            aria-label={`${stage.name} column`}
            onDragOver={(e) => {
              if (!canMove || !draggingId) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (overStageId !== stage.id) setOverStageId(stage.id);
            }}
            onDragLeave={(e) => {
              // Only clear when leaving the column bounds, not a child.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOverStageId((cur) => (cur === stage.id ? null : cur));
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const dropped = e.dataTransfer.getData('text/plain') || draggingId;
              if (dropped) {
                if (dropped !== draggingId) setDraggingId(dropped);
                handleDrop(stage.id);
              }
            }}
            className={cn(
              'flex w-72 shrink-0 flex-col rounded-xl border bg-surface-container-low transition-colors motion-reduce:transition-none',
              isOver ? 'border-primary ring-2 ring-primary/40' : 'border-outline-variant'
            )}
          >
            <header className="flex items-center justify-between gap-2 border-b border-outline-variant px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: stage.color || 'var(--border-color)' }}
                  aria-hidden
                />
                <span className="truncate text-sm font-semibold text-on-surface">{stage.name}</span>
                <span className="rounded-full bg-surface-container-high px-1.5 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                  {columnDeals.length}
                </span>
              </div>
              <span className="shrink-0 text-xs font-medium tabular-nums text-on-surface-variant">
                {formatCurrency(sum, currency)}
              </span>
            </header>

            <div className="flex-1 space-y-2 p-2">
              {columnDeals.length === 0 ? (
                <div className="rounded-lg border border-dashed border-outline-variant px-3 py-6 text-center text-xs text-on-surface-variant">
                  {isOver ? 'Drop here' : 'No deals'}
                </div>
              ) : (
                columnDeals.map((deal) => (
                  <article
                    key={deal.id}
                    draggable={canMove}
                    onDragStart={(e) => {
                      if (!canMove) return;
                      e.dataTransfer.setData('text/plain', deal.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggingId(deal.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOverStageId(null);
                    }}
                    className={cn(
                      'rounded-lg border border-outline-variant bg-surface p-3 shadow-sm transition motion-reduce:transition-none',
                      canMove && 'cursor-grab active:cursor-grabbing',
                      draggingId === deal.id && 'opacity-50'
                    )}
                  >
                    <Link
                      href={`/deals/${deal.id}`}
                      className="block truncate text-sm font-medium text-on-surface hover:text-primary hover:underline"
                    >
                      {deal.name}
                    </Link>
                    <p className="mt-1 text-sm font-semibold text-on-surface">
                      {formatCurrency(deal.amount, deal.currency)}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Avatar name={ownerName(owners, deal.ownerId)} size="sm" />
                      <span className="truncate text-xs text-on-surface-variant">
                        {ownerName(owners, deal.ownerId)}
                      </span>
                    </div>
                    {canMove ? (
                      <label className="mt-2 block">
                        <span className="sr-only">Move {deal.name} to stage</span>
                        <select
                          value={deal.stageId}
                          onChange={(e) => {
                            if (e.target.value !== deal.stageId) onMove(deal.id, e.target.value);
                          }}
                          className="w-full rounded-md border border-outline-variant bg-surface px-2 py-1 text-xs text-on-surface-variant outline-none focus:border-primary"
                          aria-label={`Move ${deal.name} to stage`}
                        >
                          {stages
                            .slice()
                            .sort((a, b) => a.order - b.order)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
