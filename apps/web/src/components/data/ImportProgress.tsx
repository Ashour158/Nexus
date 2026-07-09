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

  if (!progress) return <div className="h-8 animate-pulse rounded-lg bg-gray-100" />;

  const isComplete = progress.status === 'COMPLETED';
  const isFailed = progress.status === 'FAILED';

  return (
    <div className={`rounded-xl border p-4 ${isComplete ? 'border-green-200 bg-green-50' : isFailed ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-800">
          {isComplete ? '✅ Import complete' : isFailed ? '❌ Import failed' : `⏳ Importing… ${progress.progressPct}%`}
        </span>
        <span className="text-xs text-gray-500">
          {progress.processedRows}/{progress.totalRows} rows
        </span>
      </div>
      {!isComplete && !isFailed ? (
        <div className="mb-2 h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${progress.progressPct}%` }} />
        </div>
      ) : null}
      <div className="flex gap-4 text-xs text-gray-600">
        <span className="text-green-600">✓ {progress.successRows} succeeded</span>
        {progress.errorRows > 0 ? <span className="text-red-500">✗ {progress.errorRows} errors</span> : null}
      </div>
      {progress.errors && progress.errors.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-red-600">
            Show errors ({progress.errors.length})
          </summary>
          <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto">
            {progress.errors.slice(0, 20).map((err, i) => (
              <li key={`${err}-${i}`} className="text-xs text-red-500">
                {err}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
