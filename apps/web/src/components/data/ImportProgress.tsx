'use client';

import { useEffect, useState } from 'react';

interface ProgressData {
  status: string;
  totalRows: number;
  processedRows: number;
  successRows: number;
  errorRows: number;
  progressPct: number;
  errors?: string[];
}

export function ImportProgress({ jobId, onComplete }: { jobId: string; onComplete?: () => void }) {
  const [progress, setProgress] = useState<ProgressData | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const source = new EventSource(`/api/data/imports/${jobId}/status`);
    source.onmessage = (e) => {
      const data = JSON.parse(e.data) as ProgressData;
      setProgress(data);
      if (data.status === 'COMPLETED' || data.status === 'FAILED') {
        source.close();
        onComplete?.();
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, [jobId, onComplete]);

  if (!progress) return <div className="h-8 animate-pulse rounded-lg bg-surface-container-high" />;

  const isComplete = progress.status === 'COMPLETED';
  const isFailed = progress.status === 'FAILED';

  return (
    <div className={`rounded-xl border p-4 ${isComplete ? 'border-success/30 bg-success-container' : isFailed ? 'border-error/30 bg-error-container' : 'border-primary/40 bg-primary-container'}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-on-surface">
          {isComplete ? '✅ Import complete' : isFailed ? '❌ Import failed' : `⏳ Importing… ${progress.progressPct}%`}
        </span>
        <span className="text-xs text-on-surface-variant">
          {progress.processedRows}/{progress.totalRows} rows
        </span>
      </div>
      {!isComplete && !isFailed ? (
        <div className="mb-2 h-2 overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress.progressPct}%` }} />
        </div>
      ) : null}
      <div className="flex gap-4 text-xs text-on-surface-variant">
        <span className="text-success">✓ {progress.successRows} succeeded</span>
        {progress.errorRows > 0 ? <span className="text-error">✗ {progress.errorRows} errors</span> : null}
      </div>
      {progress.errors && progress.errors.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-error">
            Show errors ({progress.errors.length})
          </summary>
          <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto">
            {progress.errors.slice(0, 20).map((err, i) => (
              <li key={`${err}-${i}`} className="text-xs text-error">
                {err}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
