'use client';

import { cn } from '@/lib/cn';
import { CheckCircle2, Clock, AlertCircle, XCircle, type LucideIcon } from 'lucide-react';

export type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  icon?: boolean;
  className?: string;
}

const statusMap: Record<string, StatusVariant> = {
  'CLOSED WON': 'success',
  'CLOSED_WON': 'success',
  WON: 'success',
  PAID: 'success',
  ACTIVE: 'success',
  COMPLETED: 'success',
  'IN PROGRESS': 'info',
  'IN_PROGRESS': 'info',
  OPEN: 'info',
  NEW: 'info',
  'PENDING APPROVAL': 'warning',
  'PENDING_APPROVAL': 'warning',
  PENDING: 'warning',
  'CLOSED LOST': 'danger',
  'CLOSED_LOST': 'danger',
  LOST: 'danger',
  FAILED: 'danger',
  INACTIVE: 'neutral',
};

const variantStyles: Record<StatusVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  danger: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800',
  info: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700',
};

const variantIcons: Record<StatusVariant, LucideIcon> = {
  success: CheckCircle2,
  warning: Clock,
  danger: XCircle,
  info: Clock,
  neutral: AlertCircle,
};

export function StatusBadge({ status, variant, icon = false, className }: StatusBadgeProps) {
  const resolvedVariant = variant ?? statusMap[status.toUpperCase()] ?? 'neutral';
  const Icon = variantIcons[resolvedVariant];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        variantStyles[resolvedVariant],
        className
      )}
    >
      {icon ? <Icon className="h-3 w-3" /> : null}
      {status}
    </span>
  );
}
