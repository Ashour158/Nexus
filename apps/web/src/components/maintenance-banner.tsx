'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Scheduled-maintenance banner.
 *
 * Non-breaking and OFF by default. It reads a single build-time env flag,
 * `NEXT_PUBLIC_MAINTENANCE` (truthy values: `1`, `true`, `on`), and an optional
 * `NEXT_PUBLIC_MAINTENANCE_MESSAGE`. When the flag is unset the component renders
 * nothing. The banner is dismissible for the session (persisted in
 * `sessionStorage`) so it never traps the user.
 */

const FLAG = process.env.NEXT_PUBLIC_MAINTENANCE;
const MESSAGE =
  process.env.NEXT_PUBLIC_MAINTENANCE_MESSAGE ??
  'Scheduled maintenance is in progress. Some features may be temporarily unavailable.';

const DISMISS_KEY = 'nexus-maintenance-dismissed';

function isEnabled(): boolean {
  const v = String(FLAG ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

export function MaintenanceBanner(): JSX.Element | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isEnabled()) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* sessionStorage unavailable — still show the banner */
    }
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore persistence failure */
    }
    setVisible(false);
  };

  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <p className="flex-1">{MESSAGE}</p>
      <button
        onClick={dismiss}
        aria-label="Dismiss maintenance notice"
        className="rounded p-1 text-amber-700 transition hover:bg-amber-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
