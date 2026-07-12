import { GitBranch } from 'lucide-react';
import { PipelineClient } from './pipeline-client';

export default function PipelineManagementPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-lg bg-primary-container px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
            <GitBranch className="h-3.5 w-3.5" />
            Sales operating model
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-on-surface">Pipeline Management</h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
            Configure sales pipelines, stage order, probabilities, and stale-deal thresholds used by deals,
            forecasts, approvals, routing, and reporting.
          </p>
        </div>
      </div>

      <PipelineClient />
    </div>
  );
}
