'use client';

import Link from 'next/link';
import { GoogleMap, InfoWindow, Marker, useJsApiLoader } from '@react-google-maps/api';
import type { Account } from '@nexus/shared-types';
import { formatCurrency } from '@/lib/format';

type AccountWithGeo = Omit<Account, 'status'> & {
  lat?: number | null;
  lng?: number | null;
  status: 'ACTIVE' | 'INACTIVE' | 'AT_RISK' | 'CHURNED';
};

function markerIcon(status: AccountWithGeo['status']): string {
  const color =
    status === 'CHURNED' ? '#dc2626' : status === 'AT_RISK' ? '#d97706' : '#16a34a';
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="10" fill="${color}" stroke="white" stroke-width="3"/></svg>`
  )}`;
}

interface AccountMapViewProps {
  accounts: AccountWithGeo[];
  mapAccount: AccountWithGeo | null;
  onMapAccountChange: (a: AccountWithGeo | null) => void;
}

export default function AccountMapView({ accounts, mapAccount, onMapAccountChange }: AccountMapViewProps) {
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const maps = useJsApiLoader({
    googleMapsApiKey: mapsApiKey,
    id: 'nexus-google-maps',
  });

  const mappedAccounts = accounts.filter(
    (a) => typeof a.lat === 'number' && typeof a.lng === 'number'
  );

  const mapCenter =
    mappedAccounts.length === 0
      ? { lat: 25.2048, lng: 55.2708 }
      : {
          lat:
            mappedAccounts.reduce((sum, a) => sum + (a.lat ?? 0), 0) /
            mappedAccounts.length,
          lng:
            mappedAccounts.reduce((sum, a) => sum + (a.lng ?? 0), 0) /
            mappedAccounts.length,
        };

  if (!mapsApiKey) {
    return (
      <div className="p-10 text-center text-sm text-on-surface-variant">
        Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map.
      </div>
    );
  }

  if (!maps.isLoaded) {
    return <div className="p-10 text-center text-sm text-on-surface-variant">Loading map…</div>;
  }

  if (mappedAccounts.length === 0) {
    return (
      <div className="p-10 text-center text-sm text-on-surface-variant">
        No visible accounts have coordinates yet.
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ height: 640, width: '100%' }}
      center={mapCenter}
      zoom={mappedAccounts.length === 1 ? 10 : 5}
    >
      {mappedAccounts.map((a) => (
        <Marker
          key={a.id}
          position={{ lat: a.lat as number, lng: a.lng as number }}
          icon={markerIcon(a.status)}
          onClick={() => onMapAccountChange(a)}
        />
      ))}
      {mapAccount?.lat && mapAccount.lng ? (
        <InfoWindow
          position={{ lat: mapAccount.lat, lng: mapAccount.lng }}
          onCloseClick={() => onMapAccountChange(null)}
        >
          <div className="max-w-xs text-sm">
            <Link href={`/accounts/${mapAccount.id}`} className="font-semibold text-on-surface underline">
              {mapAccount.name}
            </Link>
            <p className="mt-1 text-on-surface-variant">{mapAccount.industry ?? 'No industry'}</p>
            <p className="text-on-surface-variant">
              ARR:{' '}
              {mapAccount.annualRevenue
                ? formatCurrency(mapAccount.annualRevenue, 'USD')
                : '—'}
            </p>
          </div>
        </InfoWindow>
      ) : null}
    </GoogleMap>
  );
}
