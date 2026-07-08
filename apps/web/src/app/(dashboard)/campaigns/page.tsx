'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Users,
} from 'lucide-react';
import {
  useCampaigns,
  type CampaignListFilters,
  type CampaignStatus,
  type CampaignType,
} from '@/hooks/use-campaigns';
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  statusTone,
  typeTone,
} from '@/components/campaigns/campaign-ui';
import {
  CRMCard,
  CRMEmptyState,
  CRMErrorState,
  CRMMetricCard,
  CRMMetricGrid,
  CRMModuleShell,
  CRMPageHeader,
  CRMStatusBadge,
  CRMTableShell,
  CRMToolbar,
} from '@/components/ui/crm';

const PAGE_SIZE = 20;

export default function CampaignsPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<CampaignType | ''>('');
  const [status, setStatus] = useState<CampaignStatus | ''>('');
  const [ownerId, setOwnerId] = useState('');
  const [page, setPage] = useState(1);

  const filters: CampaignListFilters = useMemo(
    () => ({
      search: search.trim() || undefined,
      type: type || undefined,
      status: status || undefined,
      ownerId: ownerId.trim() || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    [search, type, status, ownerId, page]
  );

  const { data, isLoading, isError, refetch, isFetching } = useCampaigns(filters);
  const rows = data ?? [];

  // pagination meta is dropped by the envelope unwrapper, so infer "has next"
  // from whether the page came back full.
  const hasNext = rows.length === PAGE_SIZE;

  const running = rows.filter((c) => c.status === 'RUNNING').length;
  const scheduled = rows.filter((c) => c.status === 'SCHEDULED').length;
  const members = rows.reduce((sum, c) => sum + (c.memberCount ?? 0), 0);

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return (
    <CRMModuleShell>
      <CRMPageHeader
        eyebrow="Marketing"
        icon={Megaphone}
        title="Campaigns"
        description="Plan, launch, and measure multi-channel marketing campaigns. Manage audience membership and track engagement funnels end to end."
        metrics={
          <CRMMetricGrid>
            <CRMMetricCard icon={Megaphone} label="On page" value={rows.length} tone="blue" />
            <CRMMetricCard icon={Play} label="Running" value={running} tone="emerald" />
            <CRMMetricCard icon={Send} label="Scheduled" value={scheduled} tone="amber" />
            <CRMMetricCard icon={Users} label="Members" value={members} tone="slate" />
          </CRMMetricGrid>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              href="/campaigns/new"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#137fec] px-4 text-sm font-bold text-white hover:bg-[#005baf]"
            >
              <Plus className="h-4 w-4" />
              New campaign
            </Link>
          </>
        }
      />

      <CRMToolbar>
        <div className="grid w-full gap-3 lg:grid-cols-[1.4fr_180px_180px_1fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => resetPage(setSearch)(e.target.value)}
              placeholder="Search name or subject"
              className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <select
            value={type}
            onChange={(e) => resetPage(setType)(e.target.value as CampaignType | '')}
            className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">All types</option>
            {CAMPAIGN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => resetPage(setStatus)(e.target.value as CampaignStatus | '')}
            className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">All statuses</option>
            {CAMPAIGN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            value={ownerId}
            onChange={(e) => resetPage(setOwnerId)(e.target.value)}
            placeholder="Filter by owner id"
            className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </CRMToolbar>

      {isError ? (
        <CRMErrorState
          title="Unable to load campaigns"
          description="The campaign service did not respond. Check your session and try again."
          action={
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 hover:bg-rose-50"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          }
        />
      ) : (
        <CRMCard title="Campaign registry" padded={false}>
          <CRMTableShell className="rounded-none border-0 shadow-none">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Members</th>
                  <th className="px-5 py-3">Scheduled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <Link
                        href={`/campaigns/${row.id}`}
                        className="font-bold text-slate-950 hover:text-[#005baf]"
                      >
                        {row.name}
                      </Link>
                      {row.subject ? (
                        <p className="mt-1 truncate text-xs text-slate-500">{row.subject}</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      <CRMStatusBadge tone={typeTone(row.type)}>{row.type}</CRMStatusBadge>
                    </td>
                    <td className="px-5 py-4">
                      <CRMStatusBadge tone={statusTone(row.status)}>{row.status}</CRMStatusBadge>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{row.memberCount ?? 0}</td>
                    <td className="px-5 py-4 text-slate-600">
                      {row.scheduledAt
                        ? new Date(row.scheduledAt).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <CRMEmptyState
                        icon={Megaphone}
                        title={isLoading ? 'Loading campaigns…' : 'No campaigns found'}
                        description="Create your first campaign to start engaging leads and contacts."
                        action={
                          !isLoading ? (
                            <Link
                              href="/campaigns/new"
                              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#137fec] px-4 text-sm font-bold text-white hover:bg-[#005baf]"
                            >
                              <Plus className="h-4 w-4" />
                              New campaign
                            </Link>
                          ) : undefined
                        }
                      />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CRMTableShell>
        </CRMCard>
      )}

      {(page > 1 || hasNext) && rows.length > 0 ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Page {page}</p>
          <div className="inline-flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <button
              type="button"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </CRMModuleShell>
  );
}
