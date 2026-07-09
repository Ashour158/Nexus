// ─── A1: activity/notes/timeline proxy to crm-service ───────────────────────
// finance money objects (quote/invoice/order/contract) surface their unified
// timeline + notes + activities by proxying to crm-service's polymorphic
// activities API. crm exposes `GET /api/v1/activities?entityType=QUOTE&entityId=`
// and `POST /api/v1/activities` accepting `{ entityType, entityId, ... }`. We
// forward the CALLER's JWT (not a service token) so crm enforces the same RBAC +
// tenant scope the finance route already checked, and the actor on the created
// activity is the real user.
//
// ASSUMED crm contract (documented shape — implemented against it):
//   GET  /api/v1/activities?entityType=<TYPE>&entityId=<id>&page&limit[&type=NOTE]
//        → { success, data: { data: Activity[], total, page, limit } | Activity[] }
//   POST /api/v1/activities  body { entityType, entityId, type, subject, description, ... }
//        → { success, data: Activity }
// A parallel crm-service agent is adding QUOTE|INVOICE|ORDER|CONTRACT to the
// valid `entityType` set + polymorphic entityId filtering. If that lands with a
// different query/body key, only this file changes.

import { ServiceUnavailableError } from '@nexus/service-utils';

/** Money-object entity types this service can attach activities to. */
export type MoneyEntityType = 'QUOTE' | 'INVOICE' | 'ORDER' | 'CONTRACT';

/**
 * CRM_SERVICE_URL may be a bare origin (`http://crm-service:3001`, compose) or
 * already include `/api/v1` (local dev default) — normalize to an `/api/v1`
 * base either way.
 */
function crmApiBase(): string {
  const raw = (process.env.CRM_SERVICE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
}

type ProxyAuth = {
  /** Raw `Authorization` header from the inbound request (Bearer <caller JWT>). */
  authorization?: string;
  tenantId: string;
};

function proxyHeaders(auth: ProxyAuth): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Forward tenant explicitly as a fallback for meshes that read it from a header.
    'x-tenant-id': auth.tenantId,
  };
  if (auth.authorization) headers.Authorization = auth.authorization;
  return headers;
}

async function crmFetch(
  path: string,
  init: RequestInit,
  auth: ProxyAuth
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`${crmApiBase()}${path}`, {
      ...init,
      headers: { ...proxyHeaders(auth), ...(init.headers as Record<string, string> | undefined) },
      signal: controller.signal,
    });
    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
    }
    return { status: res.status, body };
  } catch (err) {
    throw new ServiceUnavailableError(
      `crm-service activities unavailable: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timer);
  }
}

/** GET the timeline (all activities) for a money object. */
export async function fetchTimeline(
  auth: ProxyAuth,
  entityType: MoneyEntityType,
  entityId: string,
  query: { page?: number; limit?: number; type?: string } = {}
): Promise<{ status: number; body: unknown }> {
  const qs = new URLSearchParams({
    entityType,
    entityId,
    page: String(query.page ?? 1),
    limit: String(query.limit ?? 50),
  });
  if (query.type) qs.set('type', query.type);
  return crmFetch(`/activities?${qs.toString()}`, { method: 'GET' }, auth);
}

/** POST a polymorphic activity (any type) against a money object. */
export async function createActivity(
  auth: ProxyAuth,
  entityType: MoneyEntityType,
  entityId: string,
  payload: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  return crmFetch(
    `/activities`,
    { method: 'POST', body: JSON.stringify({ ...payload, entityType, entityId }) },
    auth
  );
}

/** POST a NOTE-type activity (notes are modeled as `type: NOTE` activities). */
export async function createNote(
  auth: ProxyAuth,
  entityType: MoneyEntityType,
  entityId: string,
  payload: { content: string; subject?: string; customFields?: Record<string, unknown> }
): Promise<{ status: number; body: unknown }> {
  return createActivity(auth, entityType, entityId, {
    type: 'NOTE',
    subject: payload.subject ?? 'Note',
    description: payload.content,
    customFields: payload.customFields ?? {},
  });
}
