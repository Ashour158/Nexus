'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { notify } from '@/lib/toast';

/**
 * Account de-duplication center. Mirrors the contact duplicates page but is
 * pointed at the CRM `/dedup/*` route family (which branches merge logic on the
 * group's entityType). Scanning + grouping + merge are all admin/manager gated
 * server-side.
 */

type DedupAccount = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  industry?: string;
  country?: string;
  city?: string;
};

type DedupGroup = {
  id: string;
  entityType: string;
  confidence?: number;
  status: string;
  records: Array<{ recordId: string; data: DedupAccount | null }>;
};

type GroupsResponse = { success: boolean; data?: { total: number; groups: DedupGroup[] } };

function authHeaders(token: string | null): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function AccountDuplicatesPage() {
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  const [masterByGroup, setMasterByGroup] = useState<Record<string, string>>({});

  const groupsQuery = useQuery<GroupsResponse>({
    queryKey: ['dedup', 'groups', 'account'],
    queryFn: async () => {
      const res = await fetch('/api/crm/dedup/groups?entityType=account&status=pending&limit=50', {
        headers: authHeaders(token),
      });
      return (await res.json()) as GroupsResponse;
    },
  });

  const scan = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/crm/dedup/scan', { method: 'POST', headers: authHeaders(token) });
      if (!res.ok) throw new Error('Scan could not be started');
      return res.json();
    },
    onSuccess: () => notify.success('Duplicate scan started — results appear within ~2 minutes'),
    onError: (err) => notify.error('Scan failed', err instanceof Error ? err.message : undefined),
  });

  const merge = useMutation({
    mutationFn: async ({ groupId, masterId }: { groupId: string; masterId: string }) => {
      const res = await fetch(`/api/crm/dedup/groups/${groupId}/merge`, {
        method: 'POST',
        headers: authHeaders(token),
        // Empty fieldSelections keeps the master record's own field values.
        body: JSON.stringify({ masterId, fieldSelections: {} }),
      });
      if (!res.ok) throw new Error('Merge failed');
      return res.json();
    },
    onSuccess: () => {
      notify.success('Accounts merged');
      qc.invalidateQueries({ queryKey: ['dedup', 'groups', 'account'] });
    },
    onError: (err) => notify.error('Merge failed', err instanceof Error ? err.message : undefined),
  });

  const dismiss = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await fetch(`/api/crm/dedup/groups/${groupId}/dismiss`, {
        method: 'POST',
        headers: authHeaders(token),
      });
      if (!res.ok) throw new Error('Dismiss failed');
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dedup', 'groups', 'account'] }),
    onError: (err) => notify.error('Could not dismiss', err instanceof Error ? err.message : undefined),
  });

  const groups = useMemo(() => groupsQuery.data?.data?.groups ?? [], [groupsQuery.data]);

  return (
    <main className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Duplicate Account Center</h1>
          <p className="text-sm text-slate-500">Find and merge duplicate companies. Merges are admin/manager only.</p>
        </div>
        <a href="/accounts" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
          Back to accounts
        </a>
      </div>

      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <button
          onClick={() => scan.mutate()}
          disabled={scan.isPending}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {scan.isPending ? 'Starting…' : 'Run duplicate scan'}
        </button>
        <button
          onClick={() => groupsQuery.refetch()}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
        <p className="text-sm text-slate-600">{groups.length} potential duplicate group(s) found</p>
      </section>

      <section className="space-y-3">
        {groupsQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading duplicate groups…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-slate-500">
            No pending duplicate accounts. Run a scan, then refresh in a couple of minutes.
          </p>
        ) : (
          groups.map((group) => {
            const records = group.records.filter((r) => r.data);
            const master = masterByGroup[group.id] ?? records[0]?.recordId ?? '';
            return (
              <article key={group.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold text-slate-900">Group {group.id.slice(0, 8)}</p>
                  {typeof group.confidence === 'number' ? (
                    <span className="text-sm text-slate-500">Confidence {group.confidence}%</span>
                  ) : null}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {records.map((rec) => {
                    const a = rec.data as DedupAccount;
                    return (
                      <div key={rec.recordId} className="rounded border border-slate-200 p-3 text-sm">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="radio"
                            name={`master-${group.id}`}
                            checked={master === rec.recordId}
                            onChange={() => setMasterByGroup((prev) => ({ ...prev, [group.id]: rec.recordId }))}
                          />
                          Keep as master
                        </label>
                        <p className="mt-1 font-medium text-slate-900">{a.name ?? '—'}</p>
                        <p className="text-slate-600">{a.email ?? 'No email'}</p>
                        <p className="text-slate-600">{a.phone ?? 'No phone'}</p>
                        <p className="text-slate-600">{a.website ?? 'No website'}</p>
                        <p className="text-slate-500">{[a.industry, a.city, a.country].filter(Boolean).join(' · ') || '—'}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                    onClick={() => master && merge.mutate({ groupId: group.id, masterId: master })}
                    disabled={merge.isPending || !master}
                  >
                    Merge into master
                  </button>
                  <button
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    onClick={() => dismiss.mutate(group.id)}
                    disabled={dismiss.isPending}
                  >
                    Not duplicates
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
