'use client';

import { useDroppable } from '@dnd-kit/core';
import type { Deal, Stage } from '@nexus/shared-types';
import { cn } from '@/lib/cn';
import { formatCount, formatCurrency, parseDecimal } from '@/lib/format';
import { DealCard } from './deal-card';

interface PipelineColumnProps {
  stage: Stage;
  deals: Deal[];
  /**
   * When `true`, cards are not draggable. The board sets this when the
   * current user lacks the `deals:update` permission.
   */
  dragDisabled?: boolean;
  onDealClick?: (deal: Deal) => void;
}

/**
 * A single stage column on the Kanban pipeline. Acts as a droppable zone
 * (`@dnd-kit/core`) and displays aggregate stats (deal count + total value)
 * in its header. Stage colour is sourced from `Stage.color`.
 */
export function PipelineColumn({
  stage,
  deals,
  dragDisabled = false,
  onDealClick,
}: PipelineColumnProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { stageId: stage.id },
    disabled: dragDisabled,
  });

  const totalValue = deals.reduce(
    (sum, d) => sum + parseDecimal(d.amount),
    0
  );
  const currency = deals[0]?.currency ?? 'USD';

  return (
    <section
      data-testid="pipeline-column"
      data-stage-id={stage.id}
      className={cn(
        'flex h-full w-[300px] shrink-0 flex-col rounded-xl border border-outline-variant bg-surface-container-low transition-colors',
        isOver && 'bg-primary-container/40 ring-2 ring-primary/40'
      )}
    >
      <header className="border-b border-outline-variant px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="flex-1 truncate text-sm font-semibold uppercase tracking-wide text-on-surface">
            {stage.name}
          </h3>
          <span className="shrink-0 rounded-full bg-surface-container-high px-2 py-0.5 text-xs font-semibold tabular-nums text-on-surface-variant">
            {formatCount(deals.length)}
          </span>
        </div>
        <div className="mt-1 text-xs font-medium tabular-nums text-on-surface-variant">
          {formatCurrency(totalValue, currency)}
        </div>
      </header>

      <div
        ref={setNodeRef}
        className="flex-1 space-y-2 overflow-y-auto p-2"
      >
        {deals.length === 0 ? (
          <div className="flex h-full min-h-[96px] items-center justify-center rounded-lg border border-dashed border-outline-variant text-xs text-on-surface-variant">
            Drop deals here
          </div>
        ) : (
          deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              disabled={dragDisabled}
              onClick={onDealClick}
            />
          ))
        )}
      </div>
    </section>
  );
}
