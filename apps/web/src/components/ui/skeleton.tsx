import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-container-high', className)} />;
}

export function CardSkeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border border-outline-variant bg-surface p-5">
      <div className="flex items-center justify-between">
        <div className="h-4 w-28 rounded bg-surface-container-high" />
        <div className="h-8 w-8 rounded-lg bg-surface-container-high" />
      </div>
      <div className="h-8 w-20 rounded bg-surface-container-high" />
      <div className="h-3 w-36 rounded bg-surface-container" />
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-outline-variant bg-surface p-5">
      <div className="mb-4 flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-surface-container-high" />
          <div className="h-7 w-16 rounded bg-surface-container-high" />
        </div>
        <div className="h-10 w-10 rounded-xl bg-surface-container-high" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-3 w-10 rounded bg-surface-container-high" />
        <div className="h-3 w-28 rounded bg-surface-container" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full">
      <div className="flex gap-4 border-b border-outline-variant px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 border-b border-outline-variant px-4 py-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className={`h-4 flex-1 ${j === 0 ? 'max-w-[180px]' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
