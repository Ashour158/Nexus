import { createHttpClient } from '@nexus/service-utils';
import type { IntegrationPrisma } from '../prisma.js';

const mapsClient = createHttpClient({
  baseURL: 'https://maps.googleapis.com/maps/api',
  timeoutMs: 10000,
  maxRetries: 3,
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
});

export function createGeocodingService(prisma: IntegrationPrisma) {
  return {
    async geocodeAccount(tenantId: string, accountId: string, address: string) {
      const key = process.env.GOOGLE_MAPS_API_KEY ?? '';
      try {
        const body = await mapsClient.get<{
          results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
        }>(`/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}`);
        const loc = body.results?.[0]?.geometry?.location;
        if (!loc) return null;
        await prisma.geocodedAccount.upsert({
          where: { accountId },
          update: { lat: loc.lat, lng: loc.lng, geocodedAt: new Date() },
          create: { tenantId, accountId, lat: loc.lat, lng: loc.lng },
        });

        const crmUrl = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
        const crmClient = createHttpClient({
          baseURL: crmUrl,
          headers: {
            Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
          },
          timeoutMs: 10000,
          maxRetries: 3,
          circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
        });
        await crmClient
          .patch(`/api/v1/accounts/${accountId}`, { lat: loc.lat, lng: loc.lng })
          .catch(() => undefined);
        return loc;
      } catch {
        return null;
      }
    },
  };
}
