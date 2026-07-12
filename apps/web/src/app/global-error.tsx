'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen items-center justify-center bg-surface-container-low px-4">
          <div className="max-w-md space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-error-container">
              <AlertCircle className="h-8 w-8 text-error" />
            </div>
            <h2 className="text-xl font-semibold text-on-surface">
              Something went wrong
            </h2>
            <p className="text-sm text-on-surface-variant">
              {error.message || 'An unexpected error occurred. Our team has been notified.'}
            </p>
            {error.digest ? (
              <p className="font-mono text-xs text-on-surface-variant">
                Error ID: {error.digest}
              </p>
            ) : null}
            <button
              onClick={reset}
              className="mx-auto flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary"
            >
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
