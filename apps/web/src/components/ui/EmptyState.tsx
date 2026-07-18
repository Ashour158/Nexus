import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  cta?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  secondaryCta?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  compact?: boolean;
}

export function EmptyState({
  icon = '📭',
  title,
  description,
  cta,
  secondaryCta,
  compact = false,
}: EmptyStateProps) {
  const wrapperClass = compact
    ? 'flex flex-col items-center justify-center px-4 py-8 text-center'
    : 'flex flex-col items-center justify-center px-6 py-16 text-center';

  const iconClass = compact ? 'mb-2 text-3xl' : 'mb-4 text-5xl';
  const titleClass = compact
    ? 'text-sm font-semibold text-on-surface'
    : 'text-base font-semibold text-on-surface';
  const descClass = compact
    ? 'mt-1 max-w-xs text-xs text-on-surface-variant'
    : 'mt-2 max-w-sm text-sm text-on-surface-variant';

  const renderCta = (
    item: NonNullable<EmptyStateProps['cta']>,
    primary: boolean
  ) => {
    const cls = `mt-3 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
      primary
        ? 'bg-primary text-on-primary hover:opacity-90'
        : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
    }`;
    if (item.href) return <a href={item.href} className={cls}>{item.label}</a>;
    return (
      <button type="button" onClick={item.onClick} className={cls}>
        {item.label}
      </button>
    );
  };

  return (
    <div className={wrapperClass}>
      <span className={iconClass}>{icon}</span>
      <p className={titleClass}>{title}</p>
      {description ? <p className={descClass}>{description}</p> : null}
      <div className="flex flex-wrap justify-center gap-2">
        {cta ? renderCta(cta, true) : null}
        {secondaryCta ? renderCta(secondaryCta, false) : null}
      </div>
    </div>
  );
}
