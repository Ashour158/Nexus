'use client';

import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'blue' | 'emerald' | 'amber' | 'orange' | 'rose' | 'slate';

const toneClasses: Record<Tone, { soft: string; text: string; solid: string; ring: string }> = {
  blue: {
    soft: 'bg-blue-50',
    text: 'text-[#005baf]',
    solid: 'bg-[#137fec]',
    ring: 'ring-blue-200',
  },
  emerald: {
    soft: 'bg-emerald-50',
    text: 'text-emerald-700',
    solid: 'bg-emerald-600',
    ring: 'ring-emerald-200',
  },
  amber: {
    soft: 'bg-amber-50',
    text: 'text-amber-700',
    solid: 'bg-amber-500',
    ring: 'ring-amber-200',
  },
  orange: {
    soft: 'bg-orange-50',
    text: 'text-orange-700',
    solid: 'bg-orange-500',
    ring: 'ring-orange-200',
  },
  rose: {
    soft: 'bg-rose-50',
    text: 'text-rose-700',
    solid: 'bg-rose-600',
    ring: 'ring-rose-200',
  },
  slate: {
    soft: 'bg-slate-100',
    text: 'text-slate-700',
    solid: 'bg-slate-950',
    ring: 'ring-slate-200',
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
    <section className={cn('overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm', className)}>
      <div className={cn(metrics ? 'grid lg:grid-cols-[1fr_360px]' : '')}>
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            {eyebrow ? (
              <span className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#005baf]">
                {Icon ? <Icon className="h-4 w-4" /> : null}
                {eyebrow}
              </span>
            ) : null}
            {badges}
          </div>
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
              {description ? (
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">{description}</p>
              ) : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        </div>
        {metrics ? <div className="border-t border-slate-100 bg-slate-50 p-5 lg:border-l lg:border-t-0">{metrics}</div> : null}
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
    <section className={cn('rounded-xl border border-slate-100 bg-white shadow-sm', className)}>
      {title || description || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title ? <h2 className="text-lg font-bold text-slate-950">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
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
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={cn('mb-3 inline-flex rounded-lg p-2', toneClass.soft, toneClass.text)}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

export function CRMToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-slate-100 bg-white p-4 shadow-sm', className)}>
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
    <div className={cn('inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white', className)}>
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
              active ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'
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
              ? 'bg-[#137fec] text-white shadow-sm'
              : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-[#005baf]'
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
    <span className={cn('inline-flex rounded px-2.5 py-1 text-xs font-bold ring-1', toneClass.soft, toneClass.text, toneClass.ring, className)}>
      {children}
    </span>
  );
}

export function CRMTableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm', className)}>
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
      {Icon ? <Icon className="mx-auto h-8 w-8 text-slate-300" /> : null}
      <h3 className="mt-3 text-sm font-bold text-slate-950">{title}</h3>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
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
    <div className="rounded-xl border border-rose-100 bg-rose-50 p-6 text-rose-700">
      <h3 className="text-sm font-bold">{title}</h3>
      {description ? <p className="mt-1 text-sm text-rose-600">{description}</p> : null}
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
  if (items.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;

  return (
    <div className="relative space-y-4 pl-6">
      <div className="absolute bottom-2 left-2.5 top-2 w-px bg-slate-200" />
      {items.map((item) => {
        const toneClass = toneClasses[item.tone ?? 'blue'];
        return (
          <div key={item.id} className="relative">
            <span className={cn('absolute -left-[21px] top-1.5 h-3 w-3 rounded-full ring-4 ring-white', toneClass.solid)} />
            <div className="rounded-lg border border-slate-100 bg-white p-3">
              <p className="text-sm font-bold text-slate-950">{item.title}</p>
              <p className="mt-1 text-xs text-slate-500">{item.meta}</p>
              {item.description ? <p className="mt-2 text-sm text-slate-600">{item.description}</p> : null}
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
  if (documents.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;

  return (
    <div className="divide-y divide-slate-100 rounded-lg border border-slate-100 bg-white">
      {documents.map((document) => (
        <div key={document.id} className="flex items-center justify-between gap-4 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-950">{document.name}</p>
            <p className="mt-1 text-xs text-slate-500">
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
    <aside className={cn('rounded-xl border border-slate-100 bg-white p-5 shadow-sm', className)}>
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
      {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
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
    <div className={cn('rounded-xl border border-slate-100 bg-white p-5 shadow-sm', className)}>
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
      <div className="mt-5 grid gap-4">{children}</div>
    </div>
  );
}

export function CRMFieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 md:grid-cols-2', className)}>{children}</div>;
}
