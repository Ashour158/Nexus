/**
 * Auth headers for service-to-service calls into CRM's internal mesh routes
 * (`/api/v1/internal/*`). The mesh standard is a shared `INTERNAL_SERVICE_TOKEN`
 * presented as `x-service-token` (verified in-route + by the JWT-bypass in
 * @nexus/service-utils `isInternalServiceRoute`). We still forward the tenant via
 * `x-tenant-id` for tenant scoping. `NEXUS_SERVICE_JWT` is kept as an optional
 * bearer fallback for any legacy end-user-JWT route, but the internal routes rely
 * on `x-service-token`.
 */
export function serviceAuthHeaders(tenantId: string): Record<string, string> {
  const serviceToken = process.env.INTERNAL_SERVICE_TOKEN?.trim();
  const jwt = process.env.NEXUS_SERVICE_JWT?.trim();
  const h: Record<string, string> = {
    'x-internal-service': 'comm-service',
    'x-tenant-id': tenantId,
  };
  if (serviceToken) h['x-service-token'] = serviceToken;
  if (jwt) h.Authorization = `Bearer ${jwt}`;
  return h;
}
