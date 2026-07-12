import { Loader2 } from 'lucide-react';

export default function QuotesLoading() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
    </div>
  );
}
