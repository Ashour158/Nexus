/**
 * Server-side base URL for an internal service API.
 *
 * Two conventions for `*_SERVICE_URL` grew up side by side in this app: some
 * route handlers assume the variable already ends in `/api/v1` (their fallback
 * literal contains it), while others append `/api/v1` themselves. Production
 * sets the bare origin — `http://auth-service:3000` — so every handler in the
 * first group silently built `http://auth-service:3000/profile/me` and got a
 * 404. Pages tolerated it and rendered empty, so this never surfaced as an
 * error: it looked like "no data", which is indistinguishable from a real empty
 * account and is why it survived several audits.
 *
 * Normalising here means neither convention can be wrong: pass whatever the env
 * holds and get exactly one `/api/v1` suffix.
 */
const API_PREFIX = '/api/v1';

export function serviceApiBase(envValue: string | undefined, fallback: string): string {
  const raw = (envValue ?? fallback).trim().replace(/\/+$/, '');
  return raw.endsWith(API_PREFIX) ? raw : `${raw}${API_PREFIX}`;
}
