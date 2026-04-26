/** Optional bearer used for service-to-service calls into CRM (dev / ops). */
export function serviceAuthHeaders(tenantId: string): Record<string, string> {
  const token = process.env.NEXUS_SERVICE_JWT?.trim();
  const h: Record<string, string> = {
    'x-internal-service': 'comm-service',
    'x-tenant-id': tenantId,
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
