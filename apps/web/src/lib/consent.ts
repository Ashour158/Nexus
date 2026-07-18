'use client';

/**
 * Cookie / non-essential-tracking consent (GDPR).
 *
 * The choice is persisted in localStorage and defaults to the privacy-preserving
 * option: until the user explicitly *accepts*, non-essential capture (PostHog
 * product analytics, Sentry Session Replay) stays OFF.
 *
 * Essential/functional cookies (auth session, locale, theme) are never gated —
 * only the analytics-style, non-essential capture is.
 */

export type ConsentChoice = 'accepted' | 'rejected';

export const CONSENT_STORAGE_KEY = 'nexus_cookie_consent';
/** Dispatched on the window whenever the consent choice changes. */
export const CONSENT_EVENT = 'nexus:consent-updated';

/** Returns the stored choice, or `null` when the user has not decided yet. */
export function getConsent(): ConsentChoice | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return v === 'accepted' || v === 'rejected' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Whether non-essential capture is permitted. Defaults to `false` (privacy
 * preserving) until the user explicitly accepts.
 */
export function hasNonEssentialConsent(): boolean {
  return getConsent() === 'accepted';
}

/** Persist the choice and notify listeners (same-tab) so gated SDKs can react. */
export function setConsent(choice: ConsentChoice): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    /* storage may be unavailable (private mode) — treat as no-consent */
  }
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
  } catch {
    /* ignore */
  }
}
