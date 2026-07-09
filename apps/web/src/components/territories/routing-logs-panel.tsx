'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useUsers } from '@/hooks/use-users';
import { useRoutingLogs } from '@/hooks/use-territories';

/**
 * Recent lead/account routing decisions — which record was routed to which
 * territory via which rules, and the owner it landed on. Optional lead filter.
 */
export function RoutingLogsPanel() {
  const [leadFilter, setLeadFilter] = useState('');
  const [appliedLead, setAppliedLead] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, isError, refetch } = useRoutingLogs(appliedLead || undefined, page, limit);
  const { data: users } = useUsers({ limit: 100 });

  const ownerName = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users?.data ?? []) {
      map.set(u.id, `${u.firstName} ${u.lastName}`.trim() || u.email);
    }
    return (id?: string | null) => (id ? map.get(id) ?? id : '—');
  }, [users]);

  const logs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Filter by record ID</label>
          <Input
            value={leadFilter}
            onChange={(e) => setLeadFilter(e.target.value)}
            placeholder="Lead / account id"
            className="w-64"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setPage(1);
            setAppliedLead(leadFilter.trim());
          }}
        >
          Apply
        </Button>
        {appliedLead ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLeadFilter('');
              setAppliedLead('');
              setPage(1);
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon="⚠️"
          title="Couldn't load routing logs"
          description="The territory service may be unavailable."
          cta={{ label: 'Retry', onClick: () => void refetch() }}
          compact
        />
      ) : logs.length === 0 ? (
        <EmptyState
          icon="🧭"
          title="No routing decisions yet"
          description="Routing logs appear here as leads and accounts are routed to territories."
          compact
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-400">
                  <th className="px-2 py-2">Routed At</th>
                  <th className="px-2 py-2">Record</th>
                  <th className="px-2 py-2">Territory</th>
                  <th className="px-2 py-2">Owner</th>
                  <th className="px-2 py-2">Rules</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-2 py-2 text-gray-500">
                      {new Date(log.routedAt).toLocaleString()}
                    </td>
                    <td className="px-2 py-2">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                        {log.recordType}
                      </span>{' '}
                      <span className="font-mono text-xs text-gray-500">{log.leadId}</span>
                    </td>
                    <td className="px-2 py-2">
                      {log.territory ? (
                        <span className="font-medium text-gray-900">{log.territory.name}</span>
                      ) : (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                      {log.viaDefault ? (
                        <span className="ms-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                          default
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-gray-700">{ownerName(log.assignedOwnerId)}</td>
                    <td className="px-2 py-2 text-gray-500">
                      {log.matchedRuleIds.length > 0 ? `${log.matchedRuleIds.length} matched` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
              <span>
                Page {page} of {totalPages} · {total} decisions
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
