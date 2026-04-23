'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Deal } from '@nexus/shared-types';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';

interface DealCardProps {
  deal: Deal;
  /**
   * When `true`, the card renders in its "lifted" visual state for the
   * `DragOverlay` portal in {@link PipelineBoard}. The card is _not_ wired to
   * a draggable in that mode — the overlay clone only mirrors the style.
   */
  isDragging?: boolean;
  /**
   * When `true`, the drag listeners are not attached. Used by the parent
   * board to gate dragging behind the `deals:update` permission.
   */
  disabled?: boolean;
  onClick?: (deal: Deal) => void;
}

/**
 * Kanban deal card (Section 53.1). Each card is draggable via `@dnd-kit/core`
 * and carries its `stageId` on the drag data so `PipelineBoard.handleDragEnd`
 * can decide whether a stage change happened.
 */
export function DealCard({
  deal,
  isDragging = false,
  disabled = false,
  onClick,
}: DealCardProps): JSX.Element {
  // The overlay clone (`isDragging`) and permission-gated cards (`disabled`)
  // both bypass the drag listeners.
  const dragSuppressed = isDragging || disabled;
  const { attributes, listeners, setNodeRef, transform, isDragging: dndIsDragging } =
    useDraggable({
      id: deal.id,
      data: { dealId: deal.id, stageId: deal.stageId },
      disabled: dragSuppressed,
    });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  const lifted = isDragging || dndIsDragging;

  const probability = Math.max(0, Math.min(100, deal.probability ?? 0));

  return (
    <div
      ref={dragSuppressed ? undefined : setNodeRef}
      style={style}
      {...(dragSuppressed ? {} : listeners)}
      {...(dragSuppressed ? {} : attributes)}
      onClick={() => onClick?.(deal)}
      data-testid="deal-card"
      className={cn(
        'group relative select-none rounded-md border border-border bg-background p-3 shadow-sm transition-shadow',
        'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary',
        disabled ? 'cursor-pointer' : 'cursor-grab',
        lifted && 'cursor-grabbing shadow-lg ring-2 ring-primary/50'
      )}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <h4 className="line-clamp-2 flex-1 text-sm font-medium text-foreground">
          {deal.name}
        </h4>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
          {probability}%
        </span>
      </div>

      <div className="mb-2 text-base font-semibold tabular-nums text-foreground">
        {formatCurrency(deal.amount, deal.currency)}
      </div>

      {deal.expectedCloseDate && (
        <div className="text-xs text-muted-foreground">
          Close {new Date(deal.expectedCloseDate).toLocaleDateString()}
        </div>
      )}

      {deal.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {deal.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
