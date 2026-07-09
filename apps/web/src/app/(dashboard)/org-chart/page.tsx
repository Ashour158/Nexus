'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useAuthStore } from '@/stores/auth.store';
import { useOrgChart, type OrgChartNode } from '@/hooks/use-org';

function OrgNode({ node, depth }: { node: OrgChartNode; depth: number }) {
  const reports = node.directReports ?? [];
  const hasReports = reports.length > 0;
  const [open, setOpen] = useState(depth < 2);

  return (
    <div>
      <div
        className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
        style={{ marginInlineStart: depth * 24 }}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`text-slate-400 hover:text-slate-700 ${hasReports ? '' : 'invisible'}`}
          aria-label={open ? 'Collapse reports' : 'Expand reports'}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Avatar name={node.name || 'User'} src={node.avatarUrl ?? undefined} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900">{node.name || 'Unnamed'}</div>
          <div className="truncate text-xs text-slate-500">
            {node.jobTitle || 'No title'}
            {node.department ? ` · ${node.department}` : ''}
            {node.level ? ` · ${node.level}` : ''}
          </div>
        </div>
        {hasReports ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
            {reports.length} report{reports.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
      {hasReports && open ? (
        <div className="mt-1.5 space-y-1.5 border-slate-100">
          {reports.map((r) => (
            <OrgNode key={r.userId} node={r} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function OrgChartPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canView = hasPermission('users:read');
  const { data, isLoading, isError, error } = useOrgChart();

  if (!canView) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You do not have permission to view the org chart (requires users:read).
        </div>
      </div>
    );
  }

  const roots = data?.nodes ?? [];

  return (
    <div className="max-w-4xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#137fec]">
          <Users className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Org Chart</h1>
          <p className="mt-0.5 text-sm text-slate-500">Reporting hierarchy across your organization.</p>
        </div>
      </div>

      {data?.meta?.truncated ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This chart is truncated — some deeper reporting lines are not shown.
        </div>
      ) : null}

      {isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Failed to load org chart: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      ) : isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Loading org chart…
        </div>
      ) : roots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No reporting structure yet. Assign managers to users to build the org chart.
        </div>
      ) : (
        <div className="space-y-1.5">
          {roots.map((n) => (
            <OrgNode key={n.userId} node={n} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}
