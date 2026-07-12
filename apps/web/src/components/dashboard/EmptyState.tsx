import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-outline-variant bg-surface p-8 text-center">
      <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
      <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
