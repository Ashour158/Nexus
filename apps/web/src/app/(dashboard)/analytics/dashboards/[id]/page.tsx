'use client';

import { type ReactElement, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Share2 } from 'lucide-react';
import {
  useAddWidget,
  useDashboard,
  useDeleteWidget,
  useReorderWidgets,
  useUpdateWidget,
} from '@/hooks/use-bi';
import type { BiWidget } from '@/lib/bi-types';
import { WidgetCard } from '@/components/bi/widget-card';
import { WidgetBuilder, type WidgetDraft } from '@/components/bi/widget-builder';

export default function DashboardDetailPage(): ReactElement {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: dashboard, isLoading, error } = useDashboard(id);
  const addWidget = useAddWidget(id);
  const updateWidget = useUpdateWidget(id);
  const deleteWidget = useDeleteWidget(id);
  const reorder = useReorderWidgets(id);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<BiWidget | null>(null);

  const widgets = [...(dashboard?.widgets ?? [])].sort((a, b) => a.position - b.position);

  async function handleSave(draft: WidgetDraft) {
    if (editing) {
      await updateWidget.mutateAsync({ widgetId: editing.id, patch: draft });
    } else {
      await addWidget.mutateAsync(draft);
    }
    setBuilderOpen(false);
    setEditing(null);
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...widgets];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((w) => w.id));
  }

  return (
    <main className="space-y-6">
      <Link
        href="/analytics/dashboards"
        className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> All dashboards
      </Link>

      {isLoading ? (
        <div className="rounded-xl border border-slate-100 bg-white p-10 text-center text-sm text-slate-500">
          Loading dashboard…
        </div>
      ) : error || !dashboard ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-8 text-sm text-rose-700">
          Dashboard not available. {error ? (error as Error).message : ''}
        </div>
      ) : (
        <>
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">{dashboard.name}</h1>
                {dashboard.shared && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                    <Share2 className="h-3 w-3" /> Shared
                  </span>
                )}
              </div>
              {dashboard.description && (
                <p className="text-sm text-slate-500">{dashboard.description}</p>
              )}
            </div>
            <button
              onClick={() => {
                setEditing(null);
                setBuilderOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Add widget
            </button>
          </header>

          {widgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center">
              <h3 className="text-lg font-bold text-slate-900">No widgets yet</h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Add your first widget — choose a dataset, measures, dimensions and a chart type.
              </p>
              <button
                onClick={() => {
                  setEditing(null);
                  setBuilderOpen(true);
                }}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Add widget
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {widgets.map((widget, index) => (
                <WidgetCard
                  key={widget.id}
                  widget={widget}
                  editable
                  isFirst={index === 0}
                  isLast={index === widgets.length - 1}
                  onMoveLeft={() => move(index, -1)}
                  onMoveRight={() => move(index, 1)}
                  onEdit={() => {
                    setEditing(widget);
                    setBuilderOpen(true);
                  }}
                  onDelete={() => {
                    if (confirm(`Delete widget "${widget.title}"?`)) deleteWidget.mutate(widget.id);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {builderOpen && (
        <WidgetBuilder
          initial={
            editing
              ? { title: editing.title, chartType: editing.chartType, spec: editing.spec }
              : undefined
          }
          saving={addWidget.isPending || updateWidget.isPending}
          onCancel={() => {
            setBuilderOpen(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}
    </main>
  );
}
