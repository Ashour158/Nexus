'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import { getConsent, setConsent } from '@/lib/consent';

/**
 * GDPR cookie-consent banner.
 *
 * Defaults to the privacy-preserving option: the banner only appears while the
 * user has made no choice, and non-essential capture (see `@/lib/consent`) stays
 * OFF until they explicitly accept. Rejecting is a first-class, equally-weighted
 * action. The choice persists in localStorage, so the banner does not reappear.
 *
 * Accessible: rendered as an `aria-live` region with a labelled dialog role and
 * keyboard-reachable buttons, styled with the Stitch Indigo M3 design tokens so
 * it matches light/dark mode.
 */
export function CookieConsent() {
  const [decided, setDecided] = useState(true);

  useEffect(() => {
    // Only surface the banner once the client has mounted and there is no prior
    // choice, so SSR markup and the persisted decision never mismatch.
    setDecided(getConsent() !== null);
  }, []);

  if (decided) return null;

  const choose = (choice: 'accepted' | 'rejected') => {
    setConsent(choice);
    setDecided(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie consent"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-2xl rounded-2xl border border-outline-variant bg-surface-container-high/95 p-4 shadow-modal backdrop-blur-md sm:inset-x-auto sm:right-4 sm:left-auto sm:w-[26rem]"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
          <Cookie className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-on-surface">We value your privacy</p>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            We use essential cookies to run Nexus. With your consent we also use
            non-essential analytics to improve the product. You can change this
            anytime in{' '}
            <Link
              href="/settings/data-privacy"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Data Privacy
            </Link>
            .
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => choose('accepted')}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary/90"
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={() => choose('rejected')}
              className="rounded-lg border border-outline-variant bg-surface px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
            >
              Reject non-essential
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
