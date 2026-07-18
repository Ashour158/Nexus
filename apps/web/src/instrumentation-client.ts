import * as Sentry from '@sentry/nextjs';
import { hasNonEssentialConsent } from '@/lib/consent';

// Only initialize Sentry when a DSN is actually configured. Initializing with
// replayIntegration but no DSN was throwing an uncaught "Multiple Session Replay
// instances are not supported" error during client bootstrap, which broke React
// hydration — leaving the whole app non-interactive (e.g. the login form fell
// back to a native submit and looped). Monitoring must never break the app, so
// this is both gated on a DSN and wrapped so any init error is swallowed.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn && process.env.NODE_ENV === 'production') {
  try {
    // Session Replay records user interaction and is non-essential capture: only
    // enable it once the user has accepted cookies (see the consent banner).
    // Error reporting itself stays on for reliability. If the user later accepts,
    // replay begins on the next page load.
    const replayEnabled = hasNonEssentialConsent();
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      debug: false,
      integrations: replayEnabled
        ? [
            Sentry.replayIntegration({
              maskAllText: true,
              blockAllMedia: true,
            }),
          ]
        : [],
      replaysOnErrorSampleRate: replayEnabled ? 1.0 : 0,
      replaysSessionSampleRate: replayEnabled ? 0.05 : 0,
    });
  } catch {
    /* never let error monitoring break the client app */
  }
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
