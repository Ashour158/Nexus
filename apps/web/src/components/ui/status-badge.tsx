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
  success: 'bg-success-container text-on-success-container border-success/20',
  warning: 'bg-warning-container text-on-warning-container border-warning/20',
  danger: 'bg-error-container text-on-error-container border-error/20',
  info: 'bg-info-container text-on-info-container border-info/20',
  neutral: 'bg-surface-container-high text-on-surface-variant border-outline-variant',
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
