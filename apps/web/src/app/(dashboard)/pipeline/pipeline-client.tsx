'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Layers3, Target, TimerReset } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { usePipelines, useStages, useUpdateStage } from '@/hooks/use-pipelines';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';

export function PipelineClient() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canRead =
    hasPermission('deals:read') ||
    (process.env.NODE_ENV === 'development' &&
      process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== 'false');
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const pipelinesQuery = usePipelines();
  const pipelines = pipelinesQuery.data ?? [];
  const resolvedPipelineId = selectedPipelineId ?? pipelines[0]?.id ?? null;
  const stagesQuery = useStages(resolvedPipelineId);
  const stages = stagesQuery.data ?? [];
  const updateStage = useUpdateStage();
  const averageProbability =
    stages.length > 0
      ? Math.round(stages.reduce((sum, stage) => sum + Number(stage.probability ?? 0), 0) / stages.length)
      : 0;
  const averageRottenDays =
    stages.length > 0
      ? Math.round(stages.reduce((sum, stage) => sum + Number(stage.rottenDays ?? 0), 0) / stages.length)
      : 0;

  function moveStage(stageId: string, direction: 'up' | 'down') {
    if (!resolvedPipelineId) return;
    const idx = stages.findIndex((s) => s.id === stageId);
    if (idx === -1) return;
    const newOrder = direction === 'up' ? idx : idx + 2;
    if (newOrder < 1 || newOrder > stages.length) return;

    updateStage.mutate({
      pipelineId: resolvedPipelineId,
      stageId,
      data: { order: newOrder },
    });
  }

  if (!canRead) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        You do not have permission to view pipelines.
      </div>
    );
  }

  if (pipelinesQuery.isLoading) {
    return <PipelineLoadingBlock />;
  }

  if (pipelinesQuery.isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Failed to load pipelines.
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        <EmptyState icon="" title="No pipelines" description="Create a pipeline to get started." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={<Layers3 className="h-5 w-5 text-blue-600" />}
          label="Pipelines"
          value={pipelines.length}
          detail="Active sales paths under governance"
        />
        <SummaryCard
          icon={<Target className="h-5 w-5 text-emerald-600" />}
          label="Avg probability"
          value={`${averageProbability}%`}
          detail="Weighted by configured stages"
        />
        <SummaryCard
          icon={<TimerReset className="h-5 w-5 text-amber-600" />}
          label="Rotten threshold"
          value={`${averageRottenDays}d`}
          detail="Average stale-deal trigger window"
        />
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        {pipelines.map((pipeline) => (
          <button
            key={pipeline.id}
            type="button"
            onClick={() => setSelectedPipelineId(pipeline.id)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition',
              resolvedPipelineId === pipeline.id
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            )}
          >
            {pipeline.name}
            {pipeline.isDefault ? (
              <span className="ml-1.5 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-white">
                Default
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Stages</h2>
            <p className="mt-1 text-xs text-slate-400">
              Stage changes drive deal probability, automation triggers, and forecast calculations.
            </p>
          </div>
          <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {stages.length} stages
          </span>
        </div>

        {stagesQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : stages.length === 0 ? (
          <EmptyState icon="" title="No stages" description="This pipeline has no stages yet." />
        ) : (
          <div className="divide-y divide-slate-100">
            {stages.map((stage, index) => (
              <div
                key={stage.id}
                className="flex flex-col gap-4 p-5 transition hover:bg-slate-50 sm:flex-row sm:items-center"
              >
                <div
                  className="h-10 w-10 shrink-0 rounded-lg border border-white shadow-sm"
                  style={{ backgroundColor: stage.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-950">{stage.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Order {stage.order} - Probability {stage.probability}% - Rotten {stage.rottenDays}d
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={index === 0 || updateStage.isPending}
                    onClick={() => moveStage(stage.id, 'up')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    Up
                  </button>
                  <button
                    type="button"
                    disabled={index === stages.length - 1 || updateStage.isPending}
                    onClick={() => moveStage(stage.id, 'down')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    Down
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineLoadingBlock() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-40 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-3 w-80" />
        </div>
        <div className="space-y-3 p-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
        {icon}
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}
