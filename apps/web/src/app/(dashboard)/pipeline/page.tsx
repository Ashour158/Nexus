'use client';

import { GitBranch } from 'lucide-react';
import { CRMPageHeader } from '@/components/ui/crm';
import { PipelineClient } from './pipeline-client';

export default function PipelineManagementPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <CRMPageHeader
        eyebrow="Sales operating model"
        icon={GitBranch}
        title="Pipeline Management"
        description="Configure sales pipelines, stage order, probabilities, and stale-deal thresholds used by deals, forecasts, approvals, routing, and reporting."
      />

      <PipelineClient />
    </div>
  );
}
