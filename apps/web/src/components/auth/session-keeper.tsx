'use client';

import { useEffect } from 'react';

/**
 * Keeps the cookie-backed session alive.
 *
 * The access token in the HttpOnly `nexus_token` cookie expires after ~15
 * minutes (JWT_EXPIRY). Before this existed, nothing renewed it: middleware
 * kept attaching the expired Bearer to every `/api/*` and `/bff/*` call, so
 * roughly 15 minutes into a session EVERY business API began failing at once
 * while the user still appeared signed in — the "broad, correlated 500s after
 * ~30 page views" failure mode.
 *
 * This component refreshes proactively (well before expiry) and again whenever
 * the tab regains focus after being idle, so a normal working session never
 * reaches the expiry boundary. `api-client` still refreshes reactively on a 401
 * as a backstop; both funnel through the same single-flight server endpoint.
 */

/** Renew when the last refresh is this old — comfortably inside the ~15m token lifetime. */
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
/** How often to CHECK whether a renewal is due. Cheap: reads localStorage, no network. */
const CHECK_INTERVAL_MS = 60 * 1000;
/** Only refresh on focus if at least this long has passed since the last one. */
const FOCUS_REFRESH_AFTER_MS = 5 * 60 * 1000;

/**
 * Where the last refresh time is remembered. It MUST outlive the component:
 * `lastRefresh` and the interval are per-mount, and a full document load
 * remounts and restarts both. A user who hard-navigates (opens records in new
 * tabs, reloads, follows a plain link) more often than the interval therefore
 * never refreshed once — the timer was perpetually reset before it could fire.
 * Persisting the timestamp makes renewal depend on elapsed time, not on one
 * page happening to stay mounted for 10 uninterrupted minutes.
 */
const LAST_REFRESH_KEY = 'nexus_last_session_refresh';

function readLastRefresh(): number {
  try {
    const raw = window.localStorage.getItem(LAST_REFRESH_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    // Private mode / storage disabled — treat as "never refreshed" so we err
    // toward refreshing too often rather than letting the session lapse.
    return 0;
  }
}

function writeLastRefresh(at: number): void {
  try {
    window.localStorage.setItem(LAST_REFRESH_KEY, String(at));
  } catch {
    /* non-fatal: falls back to per-mount behaviour */
  }
}

export function SessionKeeper() {
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (cancelled) return;
      // Only meaningful when a session actually exists — avoids pointless
      // requests (and cookie-clearing 401s) on the login/register screens.
      if (!document.cookie.includes('nexus_session=')) return;
      try {
        await fetch('/api/auth/session/refresh', { method: 'POST' });
        writeLastRefresh(Date.now());
      } catch {
        // Network blip — the interval and the 401 interceptor will retry.
      }
    };

    /** Refresh now if enough time has passed, regardless of which page we are on. */
    const refreshIfDue = () => {
      if (Date.now() - readLastRefresh() >= REFRESH_INTERVAL_MS) void refresh();
    };

    // Catch up on mount: after a hard navigation this is the ONLY chance to
    // renew, because the interval below starts from zero on every page load.
    refreshIfDue();

    const interval = setInterval(refreshIfDue, CHECK_INTERVAL_MS);
    const onFocus = () => {
      if (Date.now() - readLastRefresh() >= FOCUS_REFRESH_AFTER_MS) void refresh();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return null;
}
