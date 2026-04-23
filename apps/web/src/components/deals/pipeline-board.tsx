'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { Deal, Stage } from '@nexus/shared-types';
import { useMoveDeal, usePipelineDeals } from '@/hooks/use-deals';
import { cn } from '@/lib/cn';
import { formatCount, formatCurrency, parseDecimal } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/stores/auth.store';
import { DealCard } from './deal-card';
import { PipelineColumn } from './pipeline-column';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface PipelineBoardProps {
  /** The pipeline being rendered. Used as the React-Query cache key. */
  pipelineId: string;
  /** Ordered list of stages belonging to `pipelineId` (smallest `order` first). */
  stages: Stage[];
  /** Optional click handler for opening the deal detail drawer. */
  onDealClick?: (deal: Deal) => void;
  /** Extra className to merge onto the root container. */
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Kanban pipeline board (Section 53.1) — the main deal management surface.
 *
 * Responsibilities:
 * - Fetch deals for the current pipeline via {@link usePipelineDeals}.
 * - Render one {@link PipelineColumn} per stage, each as a droppable zone
 *   with an aggregate header (count + total value).
 * - Wire drag-and-drop to {@link useMoveDeal} which applies an optimistic
 *   cache update for instant feedback and rolls back on failure.
 * - Present a skeleton loading state and a full empty state when the pipeline
 *   has no deals at all.
 */
export function PipelineBoard({
  pipelineId,
  stages,
  onDealClick,
  className,
}: PipelineBoardProps): JSX.Element {
  const query = usePipelineDeals(pipelineId);
  const moveDeal = useMoveDeal();
  const canMoveDeals = useAuthStore((s) => s.hasPermission('deals:update'));

  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const deals = query.data?.data ?? [];

  /** Stages in their canonical order, with deals bucketed per stage. */
  const columns = useMemo(() => {
    const byStage = new Map<string, Deal[]>();
    for (const stage of stages) byStage.set(stage.id, []);
    for (const deal of deals) {
      const bucket = byStage.get(deal.stageId);
      if (bucket) bucket.push(deal);
    }
    return [...stages]
      .sort((a, b) => a.order - b.order)
      .map((stage) => ({
        stage,
        deals: byStage.get(stage.id) ?? [],
      }));
  }, [stages, deals]);

  /** Board-wide totals for the status strip above the columns. */
  const { totalCount, totalValue, totalCurrency } = useMemo(() => {
    const count = deals.length;
    const value = deals.reduce((sum, d) => sum + parseDecimal(d.amount), 0);
    const currency = deals[0]?.currency ?? 'USD';
    return { totalCount: count, totalValue: value, totalCurrency: currency };
  }, [deals]);

  // ── Drag handlers ────────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!canMoveDeals) return;
      const deal = deals.find((d) => d.id === event.active.id);
      setActiveDeal(deal ?? null);
    },
    [deals, canMoveDeals]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDeal(null);

      if (!canMoveDeals) return;
      if (!over) return;

      const deal = deals.find((d) => d.id === active.id);
      if (!deal) return;

      const overData = over.data.current as { stageId?: string } | undefined;
      const targetStageId = overData?.stageId ?? String(over.id);

      if (targetStageId && deal.stageId !== targetStageId) {
        moveDeal.mutate({ id: deal.id, stageId: targetStageId });
      }
    },
    [deals, moveDeal, canMoveDeals]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDeal(null);
  }, []);

  // ── Render branches ──────────────────────────────────────────────────────

  if (query.isLoading) {
    return (
      <BoardLoadingSkeleton stages={stages} className={className} />
    );
  }

  if (query.isError) {
    return (
      <div
        data-testid="pipeline-board-error"
        className={cn(
          'flex h-full items-center justify-center rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-sm text-destructive',
          className
        )}
      >
        <div className="max-w-sm text-center">
          <p className="mb-1 font-semibold">Could not load pipeline</p>
          <p className="text-destructive/80">
            {query.error instanceof Error
              ? query.error.message
              : 'Please try again.'}
          </p>
        </div>
      </div>
    );
  }

  if (stages.length === 0 || totalCount === 0) {
    return (
      <BoardEmptyState
        stages={stages}
        pipelineId={pipelineId}
        className={className}
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        data-testid="pipeline-board"
        data-pipeline-id={pipelineId}
        className={cn('flex h-full flex-col', className)}
      >
        <header className="mb-3 flex items-center justify-between px-1 text-sm">
          <div className="font-semibold text-foreground">
            {formatCount(totalCount, totalCount === 1 ? 'deal' : 'deals')}
          </div>
          <div className="tabular-nums text-muted-foreground">
            Total{' '}
            <span className="font-semibold text-foreground">
              {formatCurrency(totalValue, totalCurrency)}
            </span>
          </div>
        </header>

        <div className="flex h-full gap-3 overflow-x-auto pb-4">
          {columns.map(({ stage, deals: columnDeals }) => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              deals={columnDeals}
              dragDisabled={!canMoveDeals}
              onDealClick={onDealClick}
            />
          ))}
        </div>
      </div>

      <DragOverlay>
        {canMoveDeals && activeDeal ? (
          <DealCard deal={activeDeal} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Sub-states ─────────────────────────────────────────────────────────────

function BoardLoadingSkeleton({
  stages,
  className,
}: {
  stages: Stage[];
  className?: string;
}): JSX.Element {
  const columnCount = Math.max(stages.length, 4);
  return (
    <div
      data-testid="pipeline-board-loading"
      className={cn('flex h-full flex-col', className)}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex h-full gap-3 overflow-x-auto pb-4">
        {Array.from({ length: columnCount }).map((_, colIdx) => (
          <div
            key={colIdx}
            className="flex h-full w-[300px] shrink-0 flex-col rounded-lg border border-border bg-muted/40"
          >
            <div className="border-b border-border px-3 py-2">
              <Skeleton className="mb-2 h-3 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="flex-1 space-y-2 p-2">
              {Array.from({ length: 3 }).map((__, rowIdx) => (
                <div
                  key={rowIdx}
                  className="rounded-md border border-border bg-background p-3"
                >
                  <Skeleton className="mb-2 h-3 w-3/4" />
                  <Skeleton className="mb-2 h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BoardEmptyState({
  stages,
  pipelineId,
  className,
}: {
  stages: Stage[];
  pipelineId: string;
  className?: string;
}): JSX.Element {
  return (
    <div
      data-testid="pipeline-board-empty"
      data-pipeline-id={pipelineId}
      className={cn(
        'flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-10 text-center',
        className
      )}
    >
      <div className="mb-2 text-lg font-semibold text-foreground">
        No deals in this pipeline yet
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">
        {stages.length === 0
          ? 'Add stages to this pipeline, then create your first deal.'
          : 'Create your first deal to start tracking it through the pipeline.'}
      </p>
    </div>
  );
}
