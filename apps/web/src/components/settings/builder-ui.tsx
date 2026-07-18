'use client';

import type { ReactNode } from 'react';
import { ArrowDown, ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';

/**
 * Shared primitives for the four flagship low-code visual builders
 * (workflow rule / blueprint state-machine / approval process / layout editor).
 *
 * Everything here is self-contained (pure CSS + inline SVG), Stitch-Indigo M3
 * tokens only, keyboard-accessible, and stacks on <md.
 */

/** Two-pane master/detail shell. Rail stacks above the canvas on small screens. */
export function BuilderShell({
  rail,
  children,
}: {
  rail: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="md:sticky md:top-4 md:self-start">{rail}</aside>
      <section className="min-w-0 space-y-6">{children}</section>
    </div>
  );
}

/** Framed card used as a node in the flow / graph / stepper renderings. */
export function NodeCard({
  tone = 'surface',
  className,
  children,
}: {
  tone?: 'surface' | 'primary' | 'trigger' | 'action' | 'muted';
  className?: string;
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    surface: 'border-outline-variant bg-surface',
    primary: 'border-primary/50 bg-primary-container',
    trigger: 'border-primary/50 bg-primary-container',
    action: 'border-outline-variant bg-surface-container-low',
    muted: 'border-dashed border-outline-variant bg-surface-container-low/40',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]} ${className ?? ''}`}>{children}</div>
  );
}

/** Vertical connector with a centered arrowhead between stacked flow nodes. */
export function FlowConnector({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-1" aria-hidden>
      <span className="h-4 w-px bg-outline-variant" />
      {label ? (
        <span className="my-1 rounded-full border border-outline-variant bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
          {label}
        </span>
      ) : null}
      <ArrowDown className="h-4 w-4 text-outline" />
    </div>
  );
}

/** Small square icon button (reorder / remove). */
export function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = 'neutral',
}: {
  icon: typeof X;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'danger';
}) {
  const tones =
    tone === 'danger'
      ? 'text-on-surface-variant hover:bg-error-container hover:text-on-error-container'
      : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded-lg p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30 ${tones}`}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}

/** Up/Down/Remove control cluster for an ordered list item. */
export function ReorderControls({
  index,
  count,
  onMove,
  onRemove,
  removeLabel,
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <IconButton
        icon={ChevronUp}
        label="Move up"
        onClick={() => onMove(index, index - 1)}
        disabled={index === 0}
      />
      <IconButton
        icon={ChevronDown}
        label="Move down"
        onClick={() => onMove(index, index + 1)}
        disabled={index === count - 1}
      />
      <IconButton icon={Trash2} label={removeLabel} onClick={onRemove} tone="danger" />
    </div>
  );
}

/** Dashed “+ add …” button used to append rows to an editable list. */
export function AddRowButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-outline-variant px-3 py-2 text-xs font-medium text-on-surface-variant transition-colors hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden /> {label}
    </button>
  );
}

/** Compact labelled field wrapper for dense builder rows. */
export function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
        {label}
      </span>
      {children}
    </label>
  );
}

const controlBase =
  'w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50';

export function TextControl(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input className={`${controlBase} ${className ?? ''}`} {...rest} />;
}

export function SelectControl(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return (
    <select className={`${controlBase} ${className ?? ''}`} {...rest}>
      {children}
    </select>
  );
}

export function TextAreaControl(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea className={`${controlBase} ${className ?? ''}`} {...rest} />;
}

/** Chip used to render a condition / value inline in a flow preview. */
export function Chip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'primary' | 'field' | 'op';
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-surface-container-high text-on-surface-variant',
    primary: 'bg-primary-container text-on-primary-container',
    field: 'bg-secondary-container text-on-secondary-container',
    op: 'bg-tertiary-container text-on-tertiary-container',
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Numbered step badge for stepper renderings. */
export function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-on-primary">
      {n}
    </span>
  );
}
