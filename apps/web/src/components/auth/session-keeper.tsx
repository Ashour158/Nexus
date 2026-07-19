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

/** Refresh every 10 minutes — comfortably inside the ~15m token lifetime. */
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
/** Only refresh on focus if at least this long has passed since the last one. */
const FOCUS_REFRESH_AFTER_MS = 5 * 60 * 1000;

export function SessionKeeper() {
  useEffect(() => {
    let lastRefresh = Date.now();
    let cancelled = false;

    const refresh = async () => {
      if (cancelled) return;
      // Only meaningful when a session actually exists — avoids pointless
      // requests (and cookie-clearing 401s) on the login/register screens.
      if (!document.cookie.includes('nexus_session=')) return;
      try {
        await fetch('/api/auth/session/refresh', { method: 'POST' });
        lastRefresh = Date.now();
      } catch {
        // Network blip — the interval and the 401 interceptor will retry.
      }
    };

    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    const onFocus = () => {
      if (Date.now() - lastRefresh >= FOCUS_REFRESH_AFTER_MS) void refresh();
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
