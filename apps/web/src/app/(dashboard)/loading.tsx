import { TableSkeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-outline-variant bg-surface p-5">
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 rounded bg-surface-container-highest" />
              <div className="h-8 w-8 rounded-lg bg-surface-container-highest" />
            </div>
            <div className="h-8 w-16 rounded bg-surface-container-highest" />
            <div className="h-3 w-32 rounded bg-surface-container-high" />
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-outline-variant bg-surface p-5">
        <div className="h-5 w-32 rounded bg-surface-container-highest" />
        <TableSkeleton rows={6} />
      </div>
    </div>
  );
}
