import type { IntegrationPrisma } from '../prisma.js';

export function createGeocodingService(prisma: IntegrationPrisma) {
  return {
    async geocodeAccount(tenantId: string, accountId: string, address: string) {
      const key = process.env.GOOGLE_MAPS_API_KEY ?? '';
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const body = (await res.json()) as {
        results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
      };
      const loc = body.results?.[0]?.geometry?.location;
      if (!loc) return null;
      await prisma.geocodedAccount.upsert({
        where: { accountId },
        update: { lat: loc.lat, lng: loc.lng, geocodedAt: new Date() },
        create: { tenantId, accountId, lat: loc.lat, lng: loc.lng },
      });

      const crmUrl = process.env.CRM_SERVICE_URL ?? 'http://localhost:3001';
      await fetch(`${crmUrl}/api/v1/accounts/${accountId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
        },
        body: JSON.stringify({ lat: loc.lat, lng: loc.lng }),
      }).catch(() => undefined);
      return loc;
    },
  };
}
