'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Rehydrates the persisted auth store on the client, then renders children.
 *
 * The auth store uses `skipHydration: true`, so on the server AND the first
 * client render it is empty — identical markup, no hydration mismatch. After
 * mount we rehydrate from sessionStorage and flip to the real UI (client-only,
 * so nothing to mismatch). This makes permission-gated pages that early-return a
 * different tree based on `hasPermission()` safe (fixes React #418/#422 crashes).
 */
export function HydrationGate({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void useAuthStore.persist.rehydrate();
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
          <span className="text-sm text-on-surface-variant">Loading…</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
