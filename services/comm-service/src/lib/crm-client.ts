import { serviceAuthHeaders } from './http.js';

export interface ContactLookup {
  /**
   * - 'found'      → contact exists ({ contact } populated)
   * - 'not_found'  → CRM authoritatively answered 404 (fail-closed at caller)
   * - 'unavailable'→ transport/auth error; existence is unknown (fail-open at caller)
   */
  outcome: 'found' | 'not_found' | 'unavailable';
  contact?: { id: string; email?: string | null };
}

/**
 * Base URL for CRM's `/api/v1/internal/*` mesh routes. CRM_SERVICE_URL may be a
 * bare origin (`http://crm-service:3001`, compose) or already include `/api/v1`
 * (local dev default) — normalize to an `/api/v1` base either way.
 */
function crmInternalBase(): string {
  const raw = (process.env.CRM_SERVICE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
}

/**
 * Look up a contact (id + primary email) via CRM's internal mesh route,
 * authenticated with `x-service-token` (INTERNAL_SERVICE_TOKEN). Distinguishes a
 * genuine 404 from a transport/auth failure so the caller can fail-closed vs.
 * fail-open appropriately.
 */
export async function fetchContact(
  tenantId: string,
  contactId: string
): Promise<ContactLookup> {
  const base = crmInternalBase();
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(`${base}/internal/contacts/${contactId}`, {
      headers: serviceAuthHeaders(tenantId),
      signal: controller.signal,
    }).finally(() => clearTimeout(t));
    if (res.status === 404) return { outcome: 'not_found' };
    if (!res.ok) return { outcome: 'unavailable' };
    const json = (await res.json()) as { data?: { id?: string; email?: string | null } };
    const row = json.data ?? (json as { id?: string; email?: string | null });
    if (!row?.id) return { outcome: 'not_found' };
    return { outcome: 'found', contact: { id: row.id, email: row.email } };
  } catch {
    return { outcome: 'unavailable' };
  }
}

/**
 * Convenience wrapper preserving the previous `{ id, email } | null` shape for
 * callers (e.g. the sequence send loop) that only need the email and are content
 * to treat any non-'found' outcome as "no email available".
 */
export async function fetchContactEmail(
  tenantId: string,
  contactId: string
): Promise<{ id: string; email?: string | null } | null> {
  const result = await fetchContact(tenantId, contactId);
  return result.outcome === 'found' && result.contact ? result.contact : null;
}

export async function fetchDealForTenant(
  tenantId: string,
  dealId: string
): Promise<{
  id: string;
  name?: string;
  ownerId?: string;
  accountId?: string;
} | null> {
  const base = (process.env.CRM_SERVICE_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(`${base}/deals/${dealId}`, {
      headers: serviceAuthHeaders(tenantId),
      signal: controller.signal,
    }).finally(() => clearTimeout(t));
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { id?: string; name?: string; ownerId?: string; accountId?: string };
    };
    const row = json.data;
    if (!row?.id) return null;
    return row as { id: string; name?: string; ownerId?: string; accountId?: string };
  } catch {
    return null;
  }
}

export async function fetchDealPrimaryContactEmail(
  tenantId: string,
  dealId: string
): Promise<string | undefined> {
  const base = (process.env.CRM_SERVICE_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(`${base}/deals/${dealId}/contacts`, {
      headers: serviceAuthHeaders(tenantId),
      signal: controller.signal,
    }).finally(() => clearTimeout(t));
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      data?: Array<{ contact?: { email?: string | null }; isPrimary?: boolean }>;
    };
    const rows = json.data ?? [];
    const primary = rows.find((r) => r.isPrimary && r.contact?.email);
    const anyRow = rows.find((r) => r.contact?.email);
    const email = (primary ?? anyRow)?.contact?.email;
    return email ?? undefined;
  } catch {
    return undefined;
  }
}
