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
  LOW: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700',
  MEDIUM: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-800',
  HIGH: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  URGENT: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800',
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
    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
      <AlertTriangle className="h-3 w-3" />
      SLA breached
    </span>
  );
}
