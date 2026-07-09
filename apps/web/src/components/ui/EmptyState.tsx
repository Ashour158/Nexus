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
    ? 'text-sm font-semibold text-gray-700 dark:text-gray-300'
    : 'text-base font-semibold text-gray-700 dark:text-gray-200';
  const descClass = compact
    ? 'mt-1 max-w-xs text-xs text-gray-400 dark:text-gray-500'
    : 'mt-2 max-w-sm text-sm text-gray-400 dark:text-gray-500';

  const renderCta = (
    item: NonNullable<EmptyStateProps['cta']>,
    primary: boolean
  ) => {
    const cls = `mt-3 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
      primary
        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
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
