'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { Stage } from '@nexus/shared-types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PipelineBoard } from '@/components/deals/pipeline-board';
import { usePipelines, useStages } from '@/hooks/use-pipelines';
import { usePipelineStore } from '@/stores/pipeline.store';

/**
 * Deals / Pipeline page (Section 53.1).
 *
 * Loads the tenant's pipelines, picks the active one (persisted in the
 * pipeline store, defaulting to the first), then renders the Kanban board.
 */
export default function DealsPage() {
  const pipelinesQuery = usePipelines();
  const activePipelineId = usePipelineStore((s) => s.activePipelineId);
  const setActivePipeline = usePipelineStore((s) => s.setActivePipeline);

  const pipelines = pipelinesQuery.data ?? [];
  const resolvedPipelineId = useMemo(() => {
    if (activePipelineId && pipelines.some((p) => p.id === activePipelineId)) {
      return activePipelineId;
    }
    return pipelines[0]?.id ?? null;
  }, [activePipelineId, pipelines]);

  useEffect(() => {
    if (resolvedPipelineId && resolvedPipelineId !== activePipelineId) {
      setActivePipeline(resolvedPipelineId);
    }
  }, [resolvedPipelineId, activePipelineId, setActivePipeline]);

  const stagesQuery = useStages(resolvedPipelineId);
  const stages: Stage[] = stagesQuery.data ?? [];

  return (
    <main className="min-h-screen px-6 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Deals</h1>
          <p className="text-sm text-slate-600">
            Drag cards between stages to update deal status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pipelines.length > 1 ? (
            <select
              value={resolvedPipelineId ?? ''}
              onChange={(e) => setActivePipeline(e.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}
          <Link href="/deals/new">
            <Button type="button">New deal</Button>
          </Link>
        </div>
      </header>

      {pipelinesQuery.isLoading || stagesQuery.isLoading ? (
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[60vh] rounded-md" />
          ))}
        </div>
      ) : pipelinesQuery.isError ? (
        <ErrorBanner message="Failed to load pipelines. Try again." />
      ) : !resolvedPipelineId ? (
        <EmptyState />
      ) : stagesQuery.isError ? (
        <ErrorBanner message="Failed to load stages for this pipeline." />
      ) : stages.length === 0 ? (
        <EmptyState message="This pipeline has no stages yet." />
      ) : (
        <PipelineBoard pipelineId={resolvedPipelineId} stages={stages} />
      )}
    </main>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800"
    >
      {message}
    </div>
  );
}

function EmptyState({ message }: { message?: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-sm font-medium text-slate-700">
        {message ?? 'No pipelines configured yet.'}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Ask an administrator to create a pipeline in Settings.
      </p>
    </div>
  );
}
