'use client';

import { forwardRef, type ReactNode } from 'react';
import { Inbox, Loader2, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ListState } from '@/lib/use-bff';

/** Page header with icon, title, description and an optional refresh + actions. */
export function SetupHeader({
  icon: Icon,
  title,
  description,
  onRefresh,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onRefresh?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-on-surface">
          <Icon className="h-6 w-6 text-primary" aria-hidden /> {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        {children}
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-low focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** A framed section — used for "New …" create forms. */
export function SetupPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4 rounded-xl border border-primary/40 bg-primary-container p-5">
      <h3 className="font-semibold text-on-primary-container">{title}</h3>
      {children}
    </div>
  );
}

/** A labelled text/number/select input. Always associates a real <label>. */
export const SetupInput = forwardRef<
  HTMLInputElement,
  { label: string; hint?: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>
>(function SetupInput({ label, hint, id, className, ...props }, ref) {
  const inputId = id ?? `f-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-on-surface">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        className={`w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className ?? ''}`}
        {...props}
      />
      {hint ? <p className="mt-1 text-xs text-on-surface-variant">{hint}</p> : null}
    </div>
  );
});

export function SetupSelect({
  label,
  id,
  children,
  className,
  ...props
}: { label: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const selectId = id ?? `f-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={selectId} className="mb-1 block text-sm font-medium text-on-surface">
        {label}
      </label>
      <select
        id={selectId}
        className={`w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className ?? ''}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export function PrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${className ?? ''}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Accessible on/off toggle switch. */
export function ToggleSwitch({
  checked,
  onToggle,
  label,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`h-5 w-9 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-surface-container-highest'}`}
    >
      <span
        className={`mx-0.5 block h-4 w-4 rounded-full bg-surface shadow transition-transform ${checked ? 'translate-x-4' : ''}`}
      />
    </button>
  );
}

/** Framed table container that renders loading / empty / error states. */
export function SetupTableCard({
  state,
  isEmpty,
  emptyIcon: EmptyIcon = Inbox,
  emptyTitle,
  emptyHint,
  children,
}: {
  state: ListState;
  isEmpty: boolean;
  emptyIcon?: LucideIcon;
  emptyTitle: string;
  emptyHint?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
      {state === 'loading' ? (
        <div className="flex items-center justify-center gap-2 p-12 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      ) : state === 'error' ? (
        <div className="p-12 text-center">
          <TriangleAlert className="mx-auto mb-3 h-10 w-10 text-outline" aria-hidden />
          <p className="text-sm font-medium text-on-surface-variant">Couldn&apos;t reach this service</p>
          <p className="mt-1 text-xs text-on-surface-variant">It may be starting up. Try refreshing in a moment.</p>
        </div>
      ) : isEmpty ? (
        <div className="p-12 text-center">
          <EmptyIcon className="mx-auto mb-3 h-10 w-10 text-outline" aria-hidden />
          <p className="text-sm font-medium text-on-surface-variant">{emptyTitle}</p>
          {emptyHint ? <p className="mt-1 text-xs text-on-surface-variant">{emptyHint}</p> : null}
        </div>
      ) : (
        <div className="overflow-x-auto">{children}</div>
      )}
    </div>
  );
}

/** Small pill used to display tags / statuses. */
export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'primary' | 'success' | 'error' | 'warning' }) {
  const tones: Record<string, string> = {
    neutral: 'bg-surface-container-high text-on-surface-variant',
    primary: 'bg-primary-container text-on-primary-container',
    success: 'bg-success-container text-on-success-container',
    error: 'bg-error-container text-on-error-container',
    warning: 'bg-warning-container text-on-warning-container',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
  );
}
