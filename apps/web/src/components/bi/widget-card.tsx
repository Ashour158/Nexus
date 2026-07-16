'use client';

import { type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import type { BiWidget } from '@/lib/bi-types';
import { runQuery } from '@/hooks/use-bi';
import { WidgetChart } from './widget-chart';

export function WidgetCard({
  widget,
  editable,
  onEdit,
  onDelete,
  onMoveLeft,
  onMoveRight,
  isFirst,
  isLast,
}: {
  widget: BiWidget;
  editable: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
}): ReactElement {
  const { data, isLoading, error } = useQuery({
    queryKey: ['bi', 'widget-run', widget.id, widget.spec],
    queryFn: () => runQuery(widget.spec),
    retry: false,
  });

  return (
    <div className="flex flex-col rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-on-surface">{widget.title}</h3>
          <p className="text-[11px] uppercase tracking-wider text-on-surface-variant">
            {widget.spec.dataset} · {widget.chartType}
          </p>
        </div>
        {editable && (
          <div className="flex items-center gap-0.5">
            <IconBtn title="Move left" disabled={isFirst} onClick={onMoveLeft}>
              <ChevronLeft className="h-4 w-4" />
            </IconBtn>
            <IconBtn title="Move right" disabled={isLast} onClick={onMoveRight}>
              <ChevronRight className="h-4 w-4" />
            </IconBtn>
            <IconBtn title="Edit" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn title="Delete" danger onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        )}
      </div>

      <div className="flex-1">
        {isLoading ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-on-surface-variant">
            Loading…
          </div>
        ) : error ? (
          <div className="flex h-[240px] items-center justify-center text-center text-sm text-error">
            {(error as Error).message || 'Failed to run widget'}
          </div>
        ) : data ? (
          <WidgetChart chartType={widget.chartType} result={data} height={240} measures={widget.spec?.measures} />
        ) : null}
      </div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}): ReactElement {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md p-1.5 text-on-surface-variant transition disabled:opacity-30 ${
        danger ? 'hover:bg-error-container hover:text-error' : 'hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      {children}
    </button>
  );
}
