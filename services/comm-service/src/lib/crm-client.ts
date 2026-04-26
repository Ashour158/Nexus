import { serviceAuthHeaders } from './http.js';

export async function fetchContactEmail(
  tenantId: string,
  contactId: string
): Promise<{ id: string; email?: string | null } | null> {
  const base = (process.env.CRM_SERVICE_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(`${base}/contacts/${contactId}`, {
      headers: serviceAuthHeaders(tenantId),
      signal: controller.signal,
    }).finally(() => clearTimeout(t));
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { id?: string; email?: string | null } };
    const row = json.data ?? (json as { id?: string; email?: string | null });
    if (!row?.id) return null;
    return { id: row.id, email: row.email };
  } catch {
    return null;
  }
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
