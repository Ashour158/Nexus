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
      <div className="rounded-xl border border-warning/30 bg-warning-container p-6 text-sm text-on-warning-container">
        You do not have permission to view pipelines.
      </div>
    );
  }

  if (pipelinesQuery.isLoading) {
    return <PipelineLoadingBlock />;
  }

  if (pipelinesQuery.isError) {
    return (
      <div className="rounded-xl border border-error/30 bg-error-container p-6 text-sm text-on-error-container">
        Failed to load pipelines.
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="rounded-xl border border-outline-variant bg-surface">
        <EmptyState icon="" title="No pipelines" description="Create a pipeline to get started." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={<Layers3 className="h-5 w-5 text-primary" />}
          label="Pipelines"
          value={pipelines.length}
          detail="Active sales paths under governance"
        />
        <SummaryCard
          icon={<Target className="h-5 w-5 text-success" />}
          label="Avg probability"
          value={`${averageProbability}%`}
          detail="Weighted by configured stages"
        />
        <SummaryCard
          icon={<TimerReset className="h-5 w-5 text-warning" />}
          label="Rotten threshold"
          value={`${averageRottenDays}d`}
          detail="Average stale-deal trigger window"
        />
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-outline-variant bg-surface p-3 shadow-card">
        {pipelines.map((pipeline) => (
          <button
            key={pipeline.id}
            type="button"
            onClick={() => setSelectedPipelineId(pipeline.id)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium transition',
              resolvedPipelineId === pipeline.id
                ? 'bg-primary text-on-primary'
                : 'border border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container-high'
            )}
          >
            {pipeline.name}
            {pipeline.isDefault ? (
              <span className="ml-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                Default
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant">Stages</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              Stage changes drive deal probability, automation triggers, and forecast calculations.
            </p>
          </div>
          <span className="rounded-lg bg-surface-container-high px-3 py-1 text-xs font-semibold text-on-surface-variant">
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
          <div className="divide-y divide-outline-variant">
            {stages.map((stage, index) => (
              <div
                key={stage.id}
                className="flex flex-col gap-4 p-5 transition hover:bg-surface-container-low sm:flex-row sm:items-center"
              >
                <div
                  className="h-10 w-10 shrink-0 rounded-lg shadow-sm ring-1 ring-outline-variant"
                  style={{ backgroundColor: stage.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-on-surface">{stage.name}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    Order {stage.order} - Probability {stage.probability}% - Rotten {stage.rottenDays}d
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={index === 0 || updateStage.isPending}
                    onClick={() => moveStage(stage.id, 'up')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    Up
                  </button>
                  <button
                    type="button"
                    disabled={index === stages.length - 1 || updateStage.isPending}
                    onClick={() => moveStage(stage.id, 'down')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high disabled:opacity-40"
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
      <div className="rounded-xl border border-outline-variant bg-surface p-4 shadow-card">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-40 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-card">
        <div className="border-b border-outline-variant px-5 py-4">
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
    <div className="rounded-xl border border-outline-variant bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{label}</p>
        {icon}
      </div>
      <p className="mt-3 text-3xl font-bold text-on-surface">{value}</p>
      <p className="mt-1 text-xs text-on-surface-variant">{detail}</p>
    </div>
  );
}
