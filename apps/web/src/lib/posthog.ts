import PostHog from 'posthog-js';
import { hasNonEssentialConsent } from '@/lib/consent';

export function initPostHog() {
  if (typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  if (process.env.NODE_ENV !== 'production') return;
  // Product analytics is non-essential: only start capture once the user has
  // explicitly accepted (see the cookie-consent banner). Defaults to off.
  if (!hasNonEssentialConsent()) return;

  PostHog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
    persistence: 'localStorage+cookie',
  });
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  if (!hasNonEssentialConsent()) return;
  PostHog.capture(event, properties);
}

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  if (!hasNonEssentialConsent()) return;
  PostHog.identify(userId, traits);
}

export const EVENTS = {
  DEAL_CREATED: 'deal_created',
  DEAL_STAGE_CHANGED: 'deal_stage_changed',
  CONTACT_CREATED: 'contact_created',
  LEAD_CREATED: 'lead_created',
  INVOICE_CREATED: 'invoice_created',
  QUOTE_CREATED: 'quote_created',
  REPORT_VIEWED: 'report_viewed',
  CADENCE_ENROLLED: 'cadence_enrolled',
  SEARCH_USED: 'search_used',
  COMMAND_PALETTE_USED: 'command_palette_used',
} as const;
