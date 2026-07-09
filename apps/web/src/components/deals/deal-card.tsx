'use client';

import { useEffect, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Check, Pencil, X } from 'lucide-react';
import type { Deal } from '@nexus/shared-types';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { useQuickUpdateDeal } from '@/hooks/use-deals';

function DataQualityBadge({ score }: { score?: number | null }) {
  if (score == null) return null;
  const color =
    score >= 80 ? 'bg-green-100 text-green-700' : score >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${color}`} title="Data Quality Score">
      {score}%
    </span>
  );
}

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
 *
 * When the user has edit rights (`disabled === false`) and the card is not the
 * drag-overlay clone, a hover-revealed pencil toggles an inline quick-edit for
 * amount / expected close date / probability that patches through
 * {@link useQuickUpdateDeal} (optimistic, rolls back on error) without opening
 * the detail drawer.
 */
export function DealCard({
  deal,
  isDragging = false,
  disabled = false,
  onClick,
}: DealCardProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  // The quick-edit affordance is only offered on real, editable cards — never
  // on the drag-overlay clone (`isDragging`) or permission-gated cards.
  const canQuickEdit = !isDragging && !disabled;

  // The overlay clone (`isDragging`) and permission-gated cards (`disabled`)
  // both bypass the drag listeners. Dragging is also suppressed while editing
  // so a pointer-down inside an input never starts a drag.
  const dragSuppressed = isDragging || disabled || editing;
  const { attributes, listeners, setNodeRef, transform, isDragging: dndIsDragging } =
    useDraggable({
      id: deal.id,
      data: { dealId: deal.id, stageId: deal.stageId },
      disabled: dragSuppressed,
    });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  const lifted = isDragging || dndIsDragging;

  const probability = Math.max(0, Math.min(100, deal.probability ?? 0));

  if (editing) {
    return (
      <QuickEditCard deal={deal} onDone={() => setEditing(false)} />
    );
  }

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
      {canQuickEdit ? (
        <button
          type="button"
          data-testid="deal-card-quick-edit-toggle"
          title="Quick edit"
          aria-label="Quick edit deal"
          // Stop dnd-kit's PointerSensor from starting a drag, and stop the
          // card's onClick (detail drawer) from firing.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="absolute end-1.5 top-1.5 z-10 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 focus:outline-none group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : null}

      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <h4 className="line-clamp-2 text-sm font-medium text-foreground">{deal.name}</h4>
          <DataQualityBadge score={(deal as Deal & { dataQualityScore?: number | null }).dataQualityScore} />
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{probability}%</span>
      </div>

      <div className="mb-2 text-base font-semibold tabular-nums text-foreground">
        {formatCurrency(deal.amount, deal.currency)}
      </div>

      {deal.expectedCloseDate && (
        <div className="text-xs text-muted-foreground">
          Close {new Date(deal.expectedCloseDate).toLocaleDateString()}
        </div>
      )}

      {deal.isRenewal ? (
        <div className="mt-1">
          <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
            Renewal
          </span>
        </div>
      ) : null}

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

// ─── Inline quick-edit ───────────────────────────────────────────────────────

function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/**
 * The inline editor rendered in place of the card body while quick-editing.
 * Drag is fully disabled here (the parent renders this branch instead of the
 * draggable card). Enter or blur-of-the-form saves; Esc cancels. Every input
 * stops pointer propagation defensively so the surrounding board never
 * mis-reads a click as a drag.
 */
function QuickEditCard({ deal, onDone }: { deal: Deal; onDone: () => void }): JSX.Element {
  const quickUpdate = useQuickUpdateDeal();
  const [amount, setAmount] = useState(String(deal.amount ?? ''));
  const [closeDate, setCloseDate] = useState(toDateInput(deal.expectedCloseDate));
  const [probability, setProbability] = useState(String(deal.probability ?? 0));
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef(false);

  useEffect(() => {
    firstFieldRef.current?.focus();
    firstFieldRef.current?.select();
  }, []);

  const save = () => {
    if (savedRef.current) return;
    savedRef.current = true;

    const data: Record<string, unknown> = {};

    const nextAmount = Number(amount);
    if (amount.trim() !== '' && !Number.isNaN(nextAmount) && nextAmount !== Number(deal.amount)) {
      data.amount = nextAmount;
    }

    const nextClose = closeDate ? new Date(closeDate).toISOString() : undefined;
    const prevClose = deal.expectedCloseDate ?? undefined;
    if (nextClose !== prevClose) {
      data.expectedCloseDate = nextClose;
    }

    const nextProb = Math.max(0, Math.min(100, Number(probability)));
    if (probability.trim() !== '' && !Number.isNaN(nextProb) && nextProb !== deal.probability) {
      data.probability = nextProb;
    }

    if (Object.keys(data).length > 0) {
      quickUpdate.mutate({ id: deal.id, data });
    }
    onDone();
  };

  const cancel = () => {
    savedRef.current = true;
    onDone();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <div
      data-testid="deal-card-quick-edit"
      onPointerDown={stop}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
      // Saving on blur only when focus leaves the whole card.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) save();
      }}
      className="rounded-md border border-primary/50 bg-background p-3 shadow-md ring-2 ring-primary/30"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="line-clamp-1 text-xs font-medium text-foreground">{deal.name}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Save"
            aria-label="Save"
            onPointerDown={stop}
            onClick={save}
            className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Cancel"
            aria-label="Cancel"
            onPointerDown={stop}
            onClick={cancel}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <label className="mb-1.5 block">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount</span>
        <input
          ref={firstFieldRef}
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm tabular-nums outline-none focus:border-primary"
        />
      </label>

      <label className="mb-1.5 block">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Expected close</span>
        <input
          type="date"
          value={closeDate}
          onChange={(e) => setCloseDate(e.target.value)}
          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
        />
      </label>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Probability %</span>
        <input
          type="number"
          min={0}
          max={100}
          value={probability}
          onChange={(e) => setProbability(e.target.value)}
          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm tabular-nums outline-none focus:border-primary"
        />
      </label>
    </div>
  );
}
