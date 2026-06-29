import { TableSkeleton } from '@/components/ui/skeleton';

export default function InboxLoading() {
  return (
    <div className="p-6">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <TableSkeleton rows={10} cols={3} />
      </div>
    </div>
  );
}
