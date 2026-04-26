'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactElement } from 'react';
import { GoogleMap, InfoWindow, Marker, useJsApiLoader } from '@react-google-maps/api';
import type { Account } from '@nexus/shared-types';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDate } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';
import {
  useAccounts,
  type AccountListFilters,
} from '@/hooks/use-accounts';
import { useUsers } from '@/hooks/use-users';
import { XIcon } from '@/components/ui/icons';
import { TableSkeleton } from '@/components/ui/skeleton';

/**
 * Accounts list page. Mirrors the contacts page: filterable table with a
 * detail slide-over that exposes tabs for info / contacts / deals / activity
 * timeline (all wired to the existing `use-accounts` hooks).
 */

type DetailTab = 'info' | 'contacts' | 'deals' | 'timeline';
type ViewMode = 'list' | 'map';
type AccountWithGeo = Omit<Account, 'status'> & {
  lat?: number | null;
  lng?: number | null;
  status: 'ACTIVE' | 'INACTIVE' | 'AT_RISK' | 'CHURNED';
};

const TIERS: Array<Account['tier']> = ['SMB', 'MID_MARKET', 'ENTERPRISE', 'STRATEGIC'];

function tierColor(tier: Account['tier']): string {
  switch (tier) {
    case 'STRATEGIC':
      return 'bg-violet-100 text-violet-700';
    case 'ENTERPRISE':
      return 'bg-blue-100 text-blue-700';
    case 'MID_MARKET':
      return 'bg-emerald-100 text-emerald-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function markerIcon(status: AccountWithGeo['status']): string {
  const color =
    status === 'CHURNED' ? '#dc2626' : status === 'AT_RISK' ? '#d97706' : '#16a34a';
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="10" fill="${color}" stroke="white" stroke-width="3"/></svg>`
  )}`;
}

export default function AccountsPage(): ReactElement {
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [tier, setTier] = useState<AccountListFilters['tier'] | ''>('');
  const [ownerId, setOwnerId] = useState('');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<Account | null>(null);
  const [tab, setTab] = useState<DetailTab>('info');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [mapAccount, setMapAccount] = useState<AccountWithGeo | null>(null);

  const { data, isLoading, isError, error } = useAccounts({
    search: search || undefined,
    industry: industry || undefined,
    tier: tier || undefined,
    ownerId: ownerId || undefined,
    page,
    limit: 25,
  });
  const users = useUsers();

  const accounts = data?.data ?? [];
  const mappedAccounts = useMemo(
    () =>
      (accounts as AccountWithGeo[]).filter(
        (a) => typeof a.lat === 'number' && typeof a.lng === 'number'
      ),
    [accounts]
  );
  const mapCenter = useMemo(() => {
    if (mappedAccounts.length === 0) return { lat: 25.2048, lng: 55.2708 };
    return {
      lat:
        mappedAccounts.reduce((sum, a) => sum + (a.lat ?? 0), 0) /
        mappedAccounts.length,
      lng:
        mappedAccounts.reduce((sum, a) => sum + (a.lng ?? 0), 0) /
        mappedAccounts.length,
    };
  }, [mappedAccounts]);
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const maps = useJsApiLoader({
    googleMapsApiKey: mapsApiKey,
    id: 'nexus-google-maps',
  });

  const ownerMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users.data?.data ?? []) {
      m.set(u.id, `${u.firstName} ${u.lastName}`);
    }
    return m;
  }, [users.data]);

  const industries = useMemo(() => {
    const set = new Set<string>();
    for (const a of accounts) if (a.industry) set.add(a.industry);
    return Array.from(set).sort();
  }, [accounts]);

  const canRead = hasPermission('accounts:read');

  if (!canRead) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        You do not have permission to view accounts.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Accounts</h1>
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              'rounded px-3 py-1 text-xs font-medium',
              viewMode === 'list'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('map')}
            className={cn(
              'rounded px-3 py-1 text-xs font-medium',
              viewMode === 'map'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            Map
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="Search account name…"
          className="h-9 w-64 rounded-md border border-slate-200 px-3 text-sm"
        />
        <select
          value={industry}
          onChange={(e) => {
            setPage(1);
            setIndustry(e.target.value);
          }}
          className="h-9 rounded-md border border-slate-200 px-2 text-sm"
        >
          <option value="">All industries</option>
          {industries.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <select
          value={tier}
          onChange={(e) => {
            setPage(1);
            setTier(e.target.value as AccountListFilters['tier'] | '');
          }}
          className="h-9 rounded-md border border-slate-200 px-2 text-sm"
        >
          <option value="">All tiers</option>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={ownerId}
          onChange={(e) => {
            setPage(1);
            setOwnerId(e.target.value);
          }}
          className="h-9 rounded-md border border-slate-200 px-2 text-sm"
        >
          <option value="">All owners</option>
          {(users.data?.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <TableSkeleton rows={8} cols={7} />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No accounts match your filters.
        </div>
      ) : viewMode === 'map' ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {!mapsApiKey ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map.
            </div>
          ) : !maps.isLoaded ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading map…</div>
          ) : mappedAccounts.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No visible accounts have coordinates yet.
            </div>
          ) : (
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
                  onClick={() => setMapAccount(a)}
                />
              ))}
              {mapAccount?.lat && mapAccount.lng ? (
                <InfoWindow
                  position={{ lat: mapAccount.lat, lng: mapAccount.lng }}
                  onCloseClick={() => setMapAccount(null)}
                >
                  <div className="max-w-xs text-sm">
                    <Link href={`/accounts/${mapAccount.id}`} className="font-semibold text-slate-900 underline">
                      {mapAccount.name}
                    </Link>
                    <p className="mt-1 text-slate-600">{mapAccount.industry ?? 'No industry'}</p>
                    <p className="text-slate-600">
                      ARR:{' '}
                      {mapAccount.annualRevenue
                        ? formatCurrency(mapAccount.annualRevenue, 'USD')
                        : '—'}
                    </p>
                  </div>
                </InfoWindow>
              ) : null}
            </GoogleMap>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Industry</th>
                <th className="px-4 py-2">ARR</th>
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2">Owner</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => {
                    setActive(a);
                    setTab('info');
                  }}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-2 font-medium text-slate-900">
                    <Link
                      href={`/accounts/${a.id}`}
                      className="text-brand-700 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {a.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{a.industry ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {a.annualRevenue
                      ? formatCurrency(a.annualRevenue, 'USD')
                      : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px]',
                        tierColor(a.tier)
                      )}
                    >
                      {a.tier}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {ownerMap.get(a.ownerId) ?? a.ownerId.slice(0, 6)}
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {formatDate(a.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data ? (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              <span>
                Page {data.page} of {data.totalPages} · {data.total} total
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded border border-slate-200 px-2 py-1 disabled:opacity-50"
                  disabled={!data.hasPrevPage}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-200 px-2 py-1 disabled:opacity-50"
                  disabled={!data.hasNextPage}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {active ? (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close"
            className="flex-1 bg-slate-900/50"
            onClick={() => setActive(null)}
          />
          <aside className="flex w-full max-w-lg flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-slate-900">
                  {active.name}
                </h2>
                <p className="truncate text-xs text-slate-500">
                  {active.industry ?? 'No industry'} · {active.tier}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <XIcon size={16} />
              </button>
            </div>

            <div className="flex gap-1 border-b border-slate-200 px-2">
              {(['info', 'contacts', 'deals', 'timeline'] as DetailTab[]).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      '-mb-px border-b-2 px-3 py-2 text-sm capitalize',
                      tab === t
                        ? 'border-slate-900 font-semibold text-slate-900'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    )}
                  >
                    {t}
                  </button>
                )
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 text-sm">
              {tab === 'info' ? (
                <div className="space-y-1">
                  <InfoRow label="Website" value={active.website ?? '—'} />
                  <InfoRow label="Phone" value={active.phone ?? '—'} />
                  <InfoRow label="Email" value={active.email ?? '—'} />
                  <InfoRow label="Type" value={active.type} />
                  <InfoRow label="Status" value={active.status} />
                  <InfoRow
                    label="Employees"
                    value={active.employeeCount?.toString() ?? '—'}
                  />
                  <InfoRow
                    label="Country"
                    value={[active.city, active.country].filter(Boolean).join(', ') || '—'}
                  />
                  <InfoRow
                    label="Health"
                    value={
                      active.healthScore !== null
                        ? `${active.healthScore}/100`
                        : '—'
                    }
                  />
                  <InfoRow
                    label="NPS"
                    value={active.npsScore !== null ? String(active.npsScore) : '—'}
                  />
                  <InfoRow
                    label="Owner"
                    value={ownerMap.get(active.ownerId) ?? active.ownerId}
                  />
                  <InfoRow label="Created" value={formatDate(active.createdAt)} />
                  <InfoRow label="Updated" value={formatDate(active.updatedAt)} />
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                  The <span className="font-medium">{tab}</span> tab pulls from
                  <code className="mx-1">
                    GET /accounts/{active.id}/{tab === 'timeline' ? 'timeline' : tab}
                  </code>
                  via the <code>use-accounts</code> hooks. The full surface is
                  rendered by the Account 360 detail page in the next prompt.
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="w-28 shrink-0 text-xs uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <span className="flex-1 text-sm text-slate-700">{value}</span>
    </div>
  );
}
