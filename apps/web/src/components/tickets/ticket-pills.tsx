'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { StatusBadge } from '@/components/ui/status-badge';
import type { TicketPriority, TicketStatus } from '@/hooks/use-tickets';

const STATUS_LABEL: Record<TicketStatus, string> = {
  NEW: 'New',
  OPEN: 'Open',
  PENDING: 'Pending',
  ON_HOLD: 'On Hold',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const STATUS_VARIANT: Record<TicketStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  NEW: 'info',
  OPEN: 'info',
  PENDING: 'warning',
  ON_HOLD: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

export function TicketStatusPill({ status }: { status: TicketStatus }) {
  return <StatusBadge status={STATUS_LABEL[status] ?? status} variant={STATUS_VARIANT[status] ?? 'neutral'} />;
}

const PRIORITY_STYLE: Record<TicketPriority, string> = {
  LOW: 'bg-surface-container-low text-on-surface-variant border-outline-variant dark:bg-surface-container-high/50 dark:text-on-surface-variant dark:border-outline-variant',
  MEDIUM: 'bg-primary-container text-primary border-primary/40 ',
  HIGH: 'bg-warning-container text-warning border-warning/30 ',
  URGENT: 'bg-error-container text-error border-error/30 ',
};

export function TicketPriorityPill({ priority }: { priority: TicketPriority }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.MEDIUM
      )}
    >
      {priority.charAt(0) + priority.slice(1).toLowerCase()}
    </span>
  );
}

export function SlaBreachBadge({ breached }: { breached: boolean }) {
  if (!breached) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-error/30 bg-error-container px-2 py-0.5 text-xs font-medium text-error ">
      <AlertTriangle className="h-3 w-3" />
      SLA breached
    </span>
  );
}
