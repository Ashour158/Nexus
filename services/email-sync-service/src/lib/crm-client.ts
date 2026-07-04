import { serviceAuthHeaders } from './http.js';

const CRM_BASE = () =>
  (process.env.CRM_SERVICE_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');

const TIMEOUT_MS = () => parseInt(process.env.CRM_HTTP_TIMEOUT_MS ?? '8000', 10);

async function getJson<T>(path: string, tenantId: string): Promise<T | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS());
  try {
    const res = await fetch(`${CRM_BASE()}${path}`, {
      headers: serviceAuthHeaders(tenantId),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export interface ResolvedContact {
  contactId: string;
  accountId?: string | null;
}

/**
 * Resolve an email address to a CRM contact. Uses the existing
 * `GET /contacts?search=<email>` list endpoint (which matches on the email
 * column) and requires an exact, case-insensitive email match so a partial
 * search hit never mis-links a message. Fail-open: returns null on any error.
 */
export async function resolveContactByEmail(
  tenantId: string,
  email: string
): Promise<ResolvedContact | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const json = await getJson<{
    data?: { items?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
  }>(`/contacts?search=${encodeURIComponent(normalized)}&limit=25`, tenantId);
  if (!json) return null;

  // The list endpoint wraps results as { data: { items, ... } }; tolerate a few shapes.
  const container = (json as { data?: unknown }).data ?? json;
  const rows: Array<Record<string, unknown>> = Array.isArray(container)
    ? (container as Array<Record<string, unknown>>)
    : ((container as { items?: unknown[]; data?: unknown[] }).items as Array<Record<string, unknown>>) ??
      ((container as { items?: unknown[]; data?: unknown[] }).data as Array<Record<string, unknown>>) ??
      [];

  const match = rows.find((r) => {
    const rowEmail = typeof r.email === 'string' ? r.email.trim().toLowerCase() : '';
    return rowEmail === normalized && typeof r.id === 'string';
  });
  if (!match) return null;
  return {
    contactId: match.id as string,
    accountId: (match.accountId as string | undefined) ?? null,
  };
}

/**
 * Return the most relevant open deal id for a contact, if any, via
 * `GET /contacts/:id/deals`. Prefers an open/active deal, else the first.
 * Fail-open: returns null on any error.
 */
export async function resolvePrimaryDealForContact(
  tenantId: string,
  contactId: string
): Promise<string | null> {
  const json = await getJson<{
    data?: { items?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
  }>(`/contacts/${encodeURIComponent(contactId)}/deals?limit=25`, tenantId);
  if (!json) return null;
  const container = (json as { data?: unknown }).data ?? json;
  const rows: Array<Record<string, unknown>> = Array.isArray(container)
    ? (container as Array<Record<string, unknown>>)
    : ((container as { items?: unknown[] }).items as Array<Record<string, unknown>>) ?? [];
  if (rows.length === 0) return null;
  const isOpen = (r: Record<string, unknown>) => {
    const s = typeof r.status === 'string' ? r.status.toUpperCase() : '';
    const stage = typeof r.stage === 'string' ? r.stage.toUpperCase() : '';
    return s !== 'WON' && s !== 'LOST' && stage !== 'CLOSED_WON' && stage !== 'CLOSED_LOST';
  };
  const open = rows.find((r) => typeof r.id === 'string' && isOpen(r));
  const chosen = open ?? rows.find((r) => typeof r.id === 'string');
  return chosen ? (chosen.id as string) : null;
}
