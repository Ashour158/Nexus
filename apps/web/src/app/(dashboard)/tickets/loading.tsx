import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="rounded-xl border border-outline-variant bg-surface p-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="my-2 h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
