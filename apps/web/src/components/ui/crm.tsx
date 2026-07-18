'use client';

import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'blue' | 'emerald' | 'amber' | 'orange' | 'rose' | 'slate';

/**
 * Tone → Material-3 token classes. Keys are kept for backwards compatibility
 * with existing callers; the values now resolve to the Stitch Indigo palette
 * and flip automatically in dark mode.
 */
const toneClasses: Record<Tone, { soft: string; text: string; solid: string; ring: string }> = {
  blue: {
    soft: 'bg-primary-container',
    text: 'text-on-primary-container',
    solid: 'bg-primary',
    ring: 'ring-primary/20',
  },
  emerald: {
    soft: 'bg-success-container',
    text: 'text-on-success-container',
    solid: 'bg-success',
    ring: 'ring-success/20',
  },
  amber: {
    soft: 'bg-warning-container',
    text: 'text-on-warning-container',
    solid: 'bg-warning',
    ring: 'ring-warning/20',
  },
  orange: {
    soft: 'bg-tertiary-container',
    text: 'text-on-tertiary-container',
    solid: 'bg-tertiary',
    ring: 'ring-tertiary/20',
  },
  rose: {
    soft: 'bg-error-container',
    text: 'text-on-error-container',
    solid: 'bg-error',
    ring: 'ring-error/20',
  },
  slate: {
    soft: 'bg-surface-container-high',
    text: 'text-on-surface-variant',
    solid: 'bg-inverse-surface',
    ring: 'ring-outline-variant',
  },
};

export function CRMModuleShell({
  children,
  sidebar,
  className,
}: {
  children: ReactNode;
  sidebar?: ReactNode;
  className?: string;
}) {
  if (sidebar) {
    return (
      <main className={cn('grid min-w-0 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]', className)}>
        <div className="min-w-0">{sidebar}</div>
        <div className="min-w-0 space-y-8">{children}</div>
      </main>
    );
  }

  return <main className={cn('min-w-0 space-y-8', className)}>{children}</main>;
}

export function CRMPageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  badges,
  metrics,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  badges?: ReactNode;
  metrics?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-card', className)}>
      <div className={cn(metrics ? 'grid lg:grid-cols-[1fr_360px]' : '')}>
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            {eyebrow ? (
              <span className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-3 py-2 text-xs font-bold uppercase tracking-wider text-on-primary-container">
                {Icon ? <Icon className="h-4 w-4" /> : null}
                {eyebrow}
              </span>
            ) : null}
            {badges}
          </div>
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">{title}</h1>
              {description ? (
                <p className="mt-3 max-w-3xl text-sm leading-6 text-on-surface-variant sm:text-base">{description}</p>
              ) : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        </div>
        {metrics ? <div className="border-t border-outline-variant bg-surface-container-low p-5 lg:border-l lg:border-t-0">{metrics}</div> : null}
      </div>
    </section>
  );
}

export function CRMCard({
  children,
  className,
  title,
  description,
  actions,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  padded?: boolean;
}) {
  return (
    <section className={cn('rounded-xl border border-outline-variant bg-surface shadow-card', className)}>
      {title || description || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-5 py-4">
          <div>
            {title ? <h2 className="text-lg font-bold text-on-surface">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-on-surface-variant">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      <div className={cn(padded && 'p-4 sm:p-5')}>{children}</div>
    </section>
  );
}

export function CRMMetricGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-3', className)}>{children}</div>;
}

export function CRMMetricCard({
  icon: Icon,
  label,
  value,
  note,
  tone = 'blue',
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  note?: string;
  tone?: Tone;
}) {
  const toneClass = toneClasses[tone];
  return (
    <div className="rounded-xl border border-outline-variant bg-surface p-4 shadow-card">
      <div className={cn('mb-3 inline-flex rounded-lg p-2', toneClass.soft, toneClass.text)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-on-surface">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-on-surface-variant">{label}</p>
      {note ? <p className="mt-1 text-xs text-on-surface-variant">{note}</p> : null}
    </div>
  );
}

export function CRMToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-outline-variant bg-surface p-4 shadow-card', className)}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">{children}</div>
    </section>
  );
}

export function CRMSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: ComponentType<{ className?: string }> }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex overflow-hidden rounded-lg border border-outline-variant bg-surface', className)}>
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-10 items-center gap-2 px-4 text-sm font-bold transition',
              active ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
            )}
          >
            {Icon ? <Icon className="h-4 w-4" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function CRMFilterPills<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-bold transition',
            value === option.value
              ? 'bg-primary text-on-primary shadow-sm'
              : 'border border-outline-variant bg-surface text-on-surface-variant hover:border-primary/40 hover:bg-primary-container hover:text-on-primary-container'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function CRMStatusBadge({
  children,
  tone = 'slate',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const toneClass = toneClasses[tone];
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1', toneClass.soft, toneClass.text, toneClass.ring, className)}>
      {children}
    </span>
  );
}

export function CRMTableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-card', className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function CRMEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('p-10 text-center', className)}>
      {Icon ? <Icon className="mx-auto h-8 w-8 text-outline" /> : null}
      <h3 className="mt-3 text-sm font-bold text-on-surface">{title}</h3>
      {description ? <p className="mt-1 text-sm text-on-surface-variant">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function CRMErrorState({
  title = 'Unable to load data',
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-error/30 bg-error-container p-6 text-on-error-container">
      <h3 className="text-sm font-bold">{title}</h3>
      {description ? <p className="mt-1 text-sm text-on-error-container/80">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function CRMActivityTimeline({
  items,
  empty = 'No activity yet.',
}: {
  items: Array<{ id: string; title: string; meta: string; description?: string; tone?: Tone }>;
  empty?: string;
}) {
  if (items.length === 0) return <p className="text-sm text-on-surface-variant">{empty}</p>;

  return (
    <div className="relative space-y-4 pl-6">
      <div className="absolute bottom-2 left-2.5 top-2 w-px bg-outline-variant" />
      {items.map((item) => {
        const toneClass = toneClasses[item.tone ?? 'blue'];
        return (
          <div key={item.id} className="relative">
            <span className={cn('absolute -left-[21px] top-1.5 h-3 w-3 rounded-full ring-4 ring-surface', toneClass.solid)} />
            <div className="rounded-lg border border-outline-variant bg-surface p-3">
              <p className="text-sm font-bold text-on-surface">{item.title}</p>
              <p className="mt-1 text-xs text-on-surface-variant">{item.meta}</p>
              {item.description ? <p className="mt-2 text-sm text-on-surface-variant">{item.description}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CRMDocumentList({
  documents,
  empty = 'No documents attached.',
}: {
  documents: Array<{ id: string; name: string; type?: string; meta?: string; action?: ReactNode }>;
  empty?: string;
}) {
  if (documents.length === 0) return <p className="text-sm text-on-surface-variant">{empty}</p>;

  return (
    <div className="divide-y divide-outline-variant rounded-lg border border-outline-variant bg-surface">
      {documents.map((document) => (
        <div key={document.id} className="flex items-center justify-between gap-4 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-on-surface">{document.name}</p>
            <p className="mt-1 text-xs text-on-surface-variant">
              {[document.type, document.meta].filter(Boolean).join(' - ') || 'Attachment'}
            </p>
          </div>
          {document.action}
        </div>
      ))}
    </div>
  );
}

export function CRMSidePanel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside className={cn('rounded-xl border border-outline-variant bg-surface p-5 shadow-card', className)}>
      <h2 className="text-lg font-bold text-on-surface">{title}</h2>
      {description ? <p className="mt-1 text-sm leading-6 text-on-surface-variant">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </aside>
  );
}

export function CRMFormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-outline-variant bg-surface p-5 shadow-card', className)}>
      <div className="border-b border-outline-variant pb-4">
        <h2 className="text-lg font-bold text-on-surface">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-on-surface-variant">{description}</p> : null}
      </div>
      <div className="mt-5 grid gap-4">{children}</div>
    </div>
  );
}

export function CRMFieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 md:grid-cols-2', className)}>{children}</div>;
}
