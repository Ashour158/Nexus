'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void; }) {
  useEffect(() => { console.error('[Route Error]', error); }, [error]);
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-md space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-error-container">
          <AlertCircle className="h-7 w-7 text-error" />
        </div>
        <h2 className="text-xl font-semibold text-on-surface">Something went wrong</h2>
        <p className="text-sm text-on-surface-variant">{error.message || 'Unexpected error.'}</p>
        <button onClick={reset} className="mx-auto flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary"><RefreshCw className="h-4 w-4" /> Try again</button>
      </div>
    </div>
  );
}
