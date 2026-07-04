/** Optional bearer + tenant headers for service-to-service calls into CRM. */
export function serviceAuthHeaders(tenantId: string): Record<string, string> {
  const token = (process.env.NEXUS_SERVICE_JWT ?? process.env.INTERNAL_SERVICE_TOKEN)?.trim();
  const h: Record<string, string> = {
    'x-internal-service': 'email-sync-service',
    'x-tenant-id': tenantId,
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
