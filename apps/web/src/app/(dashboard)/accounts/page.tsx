'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Building2, List, Map as MapIcon, Search, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import type { Account } from '@nexus/shared-types';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDate } from '@/lib/format';

const AccountMapView = dynamic(() => import('./map-view'), { ssr: false, loading: () => <div className="p-10 text-center text-sm text-on-surface-variant">Loading map…</div> });
import { useAuthStore } from '@/stores/auth.store';
import { ExportButton } from '@/components/export/ExportButton';
import {
  accountKeys,
  useAccounts,
  useUpdateAccount,
  type AccountListFilters,
} from '@/hooks/use-accounts';
import { useUsers } from '@/hooks/use-users';
import { XIcon } from '@/components/ui/icons';
import { TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ColumnChooser, useColumnVisibility } from '@/components/ui/column-chooser';
import { EditableCell, EditableSelectCell } from '@/components/ui/editable-cell';
import { BulkActionBar } from '@/components/crm/BulkActionBar';
import { SavedViewsControl } from '@/components/crm/SavedViewsControl';

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
      return 'bg-tertiary-container text-tertiary';
    case 'ENTERPRISE':
      return 'bg-primary-container text-primary';
    case 'MID_MARKET':
      return 'bg-success-container text-success';
    default:
      return 'bg-surface-container-high text-on-surface';
  }
}

export default function AccountsPage(): ReactElement {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [isHydrated, setIsHydrated] = useState(false);

  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [tier, setTier] = useState<AccountListFilters['tier'] | ''>('');
  const [ownerId, setOwnerId] = useState('');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<Account | null>(null);
  const [tab, setTab] = useState<DetailTab>('info');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [mapAccount, setMapAccount] = useState<AccountWithGeo | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const accountCols = useColumnVisibility('accounts', [
    { key: 'name', label: 'Name' },
    { key: 'industry', label: 'Industry' },
    { key: 'arr', label: 'ARR' },
    { key: 'tier', label: 'Tier' },
    { key: 'owner', label: 'Owner' },
    { key: 'status', label: 'Status' },
    { key: 'created', label: 'Created' },
  ]);

  const { data, isLoading, isError, error } = useAccounts({
    search: search || undefined,
    industry: industry || undefined,
    tier: tier || undefined,
    ownerId: ownerId || undefined,
    page,
    limit: 25,
  });
  const users = useUsers();

  const accounts = useMemo(() => data?.data ?? [], [data]);

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

  const accountStats = useMemo(() => {
    const totalArr = accounts.reduce((sum, account) => sum + Number(account.annualRevenue ?? 0), 0);
    const strategic = accounts.filter((account) => account.tier === 'STRATEGIC').length;
    const activeCount = accounts.filter((account) => account.status === 'ACTIVE').length;
    const atRisk = accounts.filter((account) => account.status === 'AT_RISK').length;
    return { totalArr, strategic, activeCount, atRisk };
  }, [accounts]);

  const canRead = hasPermission('accounts:read');
  const canUpdate = hasPermission('accounts:update');
  const updateAccount = useUpdateAccount();

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Clear bulk selection whenever the visible result set changes, so bulk
  // actions never target rows from a previous page/filter.
  useEffect(() => {
    setSelectedIds([]);
  }, [page, search, industry, tier, ownerId]);

  if (!isHydrated) {
    return (
      <div className="rounded-lg border border-outline-variant bg-surface p-4">
        <TableSkeleton rows={6} cols={7} />
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning-container p-6 text-sm text-on-warning-container">
        You do not have permission to view accounts.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-[#dbe7f3] bg-surface shadow-sm">
        <div className="h-1.5 bg-gradient-to-r from-indigo-600 via-emerald-500 to-amber-400" />
        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-indigo-200">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-primary">Customer foundation</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-on-surface">Accounts command center</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-on-surface-variant">
                  Govern companies, billing and shipping profiles, account health, ownership, contacts, territories, and customer hierarchy from one operating view.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
        <ExportButton module="accounts" />
        <SavedViewsControl
          entityType="account"
          currentFilters={{ search, industry, tier, ownerId }}
          onApply={(filters) => {
            setPage(1);
            setSearch(typeof filters.search === 'string' ? filters.search : '');
            setIndustry(typeof filters.industry === 'string' ? filters.industry : '');
            setTier((filters.tier as AccountListFilters['tier']) ?? '');
            setOwnerId(typeof filters.ownerId === 'string' ? filters.ownerId : '');
          }}
        />
        <Link
          href="/accounts/duplicates"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-outline-variant px-3 text-xs font-bold text-on-surface-variant hover:bg-surface-container-low"
        >
          Duplicates
        </Link>
        <ColumnChooser
          allColumns={accountCols.allColumns}
          visibleKeys={accountCols.visibleKeys}
          onChange={accountCols.setVisibleKeys}
          onReset={accountCols.reset}
        />
        <div className="inline-flex rounded-lg border border-outline-variant bg-surface-container-low p-1">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-bold transition',
              viewMode === 'list'
                ? 'bg-primary text-white shadow-sm'
                : 'text-on-surface-variant hover:bg-surface'
            )}
          >
            <List className="h-3.5 w-3.5" />
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('map')}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-bold transition',
              viewMode === 'map'
                ? 'bg-primary text-white shadow-sm'
                : 'text-on-surface-variant hover:bg-surface'
            )}
          >
            <MapIcon className="h-3.5 w-3.5" />
            Map
          </button>
        </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Visible ARR" value={formatCurrency(accountStats.totalArr, 'USD')} note="Filtered account value" tone="blue" />
            <StatCard icon={<ShieldCheck className="h-4 w-4" />} label="Strategic" value={String(accountStats.strategic)} note="High-priority accounts" tone="violet" />
            <StatCard icon={<Users className="h-4 w-4" />} label="Active" value={String(accountStats.activeCount)} note="Accounts in motion" tone="emerald" />
            <StatCard icon={<Building2 className="h-4 w-4" />} label="At Risk" value={String(accountStats.atRisk)} note="Need attention" tone="amber" />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#e7edf3] bg-surface p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.5fr)_repeat(3,minmax(160px,1fr))]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="Search account name…"
          className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-high pl-10 pr-3 text-sm text-on-surface outline-none transition focus:border-primary/40 focus:bg-surface focus:ring-2 focus:ring-indigo-100"
        />
        </label>
        <select
          value={industry}
          aria-label="Filter by industry"
          onChange={(e) => {
            setPage(1);
            setIndustry(e.target.value);
          }}
          className="h-11 rounded-lg border border-outline-variant bg-surface px-3 text-sm text-on-surface outline-none focus:border-primary/40 focus:ring-2 focus:ring-indigo-100"
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
          aria-label="Filter by tier"
          onChange={(e) => {
            setPage(1);
            setTier(e.target.value as AccountListFilters['tier'] | '');
          }}
          className="h-11 rounded-lg border border-outline-variant bg-surface px-3 text-sm text-on-surface outline-none focus:border-primary/40 focus:ring-2 focus:ring-indigo-100"
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
          aria-label="Filter by owner"
          onChange={(e) => {
            setPage(1);
            setOwnerId(e.target.value);
          }}
          className="h-11 rounded-lg border border-outline-variant bg-surface px-3 text-sm text-on-surface outline-none focus:border-primary/40 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All owners</option>
          {(users.data?.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName}
            </option>
          ))}
        </select>
        </div>
      </section>

      {isLoading ? (
        <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface">
          <TableSkeleton rows={8} cols={7} />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-error/30 bg-error-container p-6 text-sm text-error">
          Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-outline-variant bg-surface">
          <EmptyState
            icon="🏢"
            title="No accounts yet"
            description="Accounts represent the companies you sell to"
            cta={{ label: '+ Add Account', href: '/accounts/new' }}
          />
        </div>
      ) : viewMode === 'map' ? (
        <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface">
          <AccountMapView
            accounts={accounts as AccountWithGeo[]}
            mapAccount={mapAccount}
            onMapAccountChange={setMapAccount}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-start text-xs uppercase tracking-wider text-on-surface-variant">
              <tr>
                <th className="px-4 py-2 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    className="rounded border-outline-variant"
                    checked={accounts.length > 0 && selectedIds.length === accounts.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedIds.length > 0 && selectedIds.length < accounts.length;
                    }}
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? accounts.map((a) => a.id) : [])
                    }
                  />
                </th>
                {accountCols.visibleKeys.includes('name') ? <th className="px-4 py-2">Name</th> : null}
                {accountCols.visibleKeys.includes('industry') ? <th className="px-4 py-2">Industry</th> : null}
                {accountCols.visibleKeys.includes('arr') ? <th className="px-4 py-2">ARR</th> : null}
                {accountCols.visibleKeys.includes('tier') ? <th className="px-4 py-2">Tier</th> : null}
                {accountCols.visibleKeys.includes('owner') ? <th className="px-4 py-2">Owner</th> : null}
                {accountCols.visibleKeys.includes('status') ? <th className="px-4 py-2">Status</th> : null}
                {accountCols.visibleKeys.includes('created') ? <th className="px-4 py-2">Created</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {accounts.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => {
                    setActive(a);
                    setTab('info');
                  }}
                  className="cursor-pointer hover:bg-surface-container-low"
                >
                  <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${a.name}`}
                      className="rounded border-outline-variant"
                      checked={selectedIds.includes(a.id)}
                      onChange={(e) =>
                        setSelectedIds((prev) =>
                          e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id)
                        )
                      }
                    />
                  </td>
                  {accountCols.visibleKeys.includes('name') ? (
                    <td className="px-4 py-2 font-medium text-on-surface">
                      <EditableCell value={a.name} onSave={(v) => updateAccount.mutate({ id: a.id, data: { name: v } })} disabled={!canUpdate}>
                        <Link
                          href={`/accounts/${a.id}`}
                          className="text-brand-700 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {a.name}
                        </Link>
                      </EditableCell>
                    </td>
                  ) : null}
                  {accountCols.visibleKeys.includes('industry') ? (
                    <td className="px-4 py-2 text-on-surface-variant">
                      <EditableCell value={a.industry ?? ''} onSave={(v) => updateAccount.mutate({ id: a.id, data: { industry: v || undefined } })} disabled={!canUpdate}>
                        {a.industry ?? '—'}
                      </EditableCell>
                    </td>
                  ) : null}
                  {accountCols.visibleKeys.includes('arr') ? (
                    <td className="px-4 py-2 text-on-surface-variant">
                      <EditableCell
                        value={a.annualRevenue ? String(a.annualRevenue) : ''}
                        onSave={(v) => {
                          const num = Number(v);
                          if (!Number.isNaN(num)) updateAccount.mutate({ id: a.id, data: { annualRevenue: num } });
                        }}
                        disabled={!canUpdate}
                      >
                        {a.annualRevenue ? formatCurrency(a.annualRevenue, 'USD') : '—'}
                      </EditableCell>
                    </td>
                  ) : null}
                  {accountCols.visibleKeys.includes('tier') ? (
                    <td className="px-4 py-2">
                      <EditableSelectCell
                        value={a.tier}
                        options={[
                          { label: 'SMB', value: 'SMB' },
                          { label: 'Mid Market', value: 'MID_MARKET' },
                          { label: 'Enterprise', value: 'ENTERPRISE' },
                          { label: 'Strategic', value: 'STRATEGIC' },
                        ]}
                        onSave={(v) => updateAccount.mutate({ id: a.id, data: { tier: v } })}
                        disabled={!canUpdate}
                      >
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px]',
                            tierColor(a.tier)
                          )}
                        >
                          {a.tier}
                        </span>
                      </EditableSelectCell>
                    </td>
                  ) : null}
                  {accountCols.visibleKeys.includes('owner') ? (
                    <td className="px-4 py-2 text-on-surface-variant">
                      <EditableSelectCell
                        value={a.ownerId}
                        options={(users.data?.data ?? []).map((u) => ({ label: `${u.firstName} ${u.lastName}`, value: u.id }))}
                        onSave={(v) => updateAccount.mutate({ id: a.id, data: { ownerId: v } })}
                        disabled={!canUpdate}
                      >
                        {ownerMap.get(a.ownerId) ?? a.ownerId.slice(0, 6)}
                      </EditableSelectCell>
                    </td>
                  ) : null}
                  {accountCols.visibleKeys.includes('status') ? (
                    <td className="px-4 py-2">
                      <EditableSelectCell
                        value={a.status}
                        options={[
                          { label: 'Active', value: 'ACTIVE' },
                          { label: 'Inactive', value: 'INACTIVE' },
                          { label: 'At Risk', value: 'AT_RISK' },
                          { label: 'Churned', value: 'CHURNED' },
                        ]}
                        onSave={(v) => updateAccount.mutate({ id: a.id, data: { status: v } })}
                        disabled={!canUpdate}
                      >
                        <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[11px] text-on-surface">
                          {a.status}
                        </span>
                      </EditableSelectCell>
                    </td>
                  ) : null}
                  {accountCols.visibleKeys.includes('created') ? (
                    <td className="px-4 py-2 text-on-surface-variant">
                      {formatDate(a.createdAt)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>

          {data ? (
            <div className="flex items-center justify-between border-t border-outline-variant px-4 py-2 text-xs text-on-surface-variant">
              <span>
                Page {data.page} of {data.totalPages} · {data.total} total
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded border border-outline-variant px-2 py-1 disabled:opacity-50"
                  disabled={!data.hasPrevPage}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="rounded border border-outline-variant px-2 py-1 disabled:opacity-50"
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
            className="flex-1 bg-inverse-surface/50"
            onClick={() => setActive(null)}
          />
          <aside className="flex w-full max-w-lg flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-on-surface">
                  {active.name}
                </h2>
                <p className="truncate text-xs text-on-surface-variant">
                  {active.industry ?? 'No industry'} · {active.tier}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container-high"
              >
                <XIcon size={16} />
              </button>
            </div>

            <div className="flex gap-1 border-b border-outline-variant px-2">
              {(['info', 'contacts', 'deals', 'timeline'] as DetailTab[]).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      '-mb-px border-b-2 px-3 py-2 text-sm capitalize',
                      tab === t
                        ? 'border-outline font-semibold text-on-surface'
                        : 'border-transparent text-on-surface-variant hover:text-on-surface'
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
                <div className="rounded-md border border-dashed border-outline-variant bg-surface-container-low p-6 text-center text-xs text-on-surface-variant">
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

      <BulkActionBar
        entityType="account"
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
        queryKey={[...accountKeys.lists()]}
        ownerOptions={(users.data?.data ?? []).map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }))}
      />
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
      <div className="w-28 shrink-0 rounded bg-surface-container-low p-1 text-xs text-on-surface-variant">{label}</div>
      <div className="flex-1 text-sm text-on-surface">{value}</div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: ReactElement;
  label: string;
  value: string;
  note: string;
  tone: 'blue' | 'emerald' | 'amber' | 'violet';
}): ReactElement {
  const tones = {
    blue: {
      bar: 'from-indigo-500 to-cyan-400',
      badge: 'border-indigo-100 bg-primary-container text-primary',
    },
    emerald: {
      bar: 'from-emerald-500 to-teal-400',
      badge: 'border-emerald-100 bg-success-container text-success',
    },
    amber: {
      bar: 'from-amber-500 to-orange-400',
      badge: 'border-amber-100 bg-warning-container text-warning',
    },
    violet: {
      bar: 'from-violet-500 to-indigo-400',
      badge: 'border-violet-100 bg-tertiary-container text-tertiary',
    },
  }[tone];

  return (
    <div className="overflow-hidden rounded-lg border border-[#e7edf3] bg-[#f9f9ff]">
      <div className={cn('h-1.5 bg-gradient-to-r', tones.bar)} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase text-on-surface-variant">{label}</p>
          <span className={cn('rounded-lg border p-2', tones.badge)}>{icon}</span>
        </div>
        <p className="mt-3 text-2xl font-bold text-on-surface">{value}</p>
        <p className="mt-1 text-sm text-on-surface-variant">{note}</p>
      </div>
    </div>
  );
}
