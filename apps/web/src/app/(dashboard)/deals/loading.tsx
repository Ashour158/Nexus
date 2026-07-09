import { Skeleton } from '@/components/ui/skeleton';

export default function DealsLoading() {
  return (
    <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
          <Skeleton className="mb-3 h-5 w-24" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((__, j) => (
              <Skeleton key={j} className="h-20 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
