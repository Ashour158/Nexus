import * as Sentry from '@sentry/nextjs';

// Only initialize Sentry when a DSN is actually configured. Initializing with
// replayIntegration but no DSN was throwing an uncaught "Multiple Session Replay
// instances are not supported" error during client bootstrap, which broke React
// hydration — leaving the whole app non-interactive (e.g. the login form fell
// back to a native submit and looped). Monitoring must never break the app, so
// this is both gated on a DSN and wrapped so any init error is swallowed.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn && process.env.NODE_ENV === 'production') {
  try {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      debug: false,
      integrations: [
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      replaysOnErrorSampleRate: 1.0,
      replaysSessionSampleRate: 0.05,
    });
  } catch {
    /* never let error monitoring break the client app */
  }
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
