import { TableSkeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="h-3 w-24 rounded bg-gray-200" />
              <div className="h-8 w-8 rounded-lg bg-gray-200" />
            </div>
            <div className="h-8 w-16 rounded bg-gray-200" />
            <div className="h-3 w-32 rounded bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5">
        <div className="h-5 w-32 rounded bg-gray-200" />
        <TableSkeleton rows={6} />
      </div>
    </div>
  );
}
