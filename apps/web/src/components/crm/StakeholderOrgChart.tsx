'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { Plus, X, User } from 'lucide-react';

type Stakeholder = {
  id: string;
  contactId: string;
  role: string;
  influence: number;
  sentiment: string;
  reportsToId: string | null;
  notes: string | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    title?: string | null;
  };
  reports: Array<{ id: string; contact: { firstName: string; lastName: string } }>;
};

const ROLES = ['Champion', 'EconomicBuyer', 'Blocker', 'Influencer', 'User', 'TechnicalBuyer', 'Coach'];
const SENTIMENTS = ['Positive', 'Neutral', 'Negative', 'Unknown'];

const ROLE_COLORS: Record<string, string> = {
  Champion: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  EconomicBuyer: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  Blocker: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  Influencer: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  User: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  TechnicalBuyer: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  Coach: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const SENTIMENT_ICONS: Record<string, string> = {
  Positive: '😊',
  Neutral: '😐',
  Negative: '😟',
  Unknown: '❓',
};

export function StakeholderOrgChart({ dealId }: { dealId: string }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);
  const authHeaders = useMemo(() => {
    const h: Record<string, string> = {};
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    if (tenantId) h['x-tenant-id'] = tenantId;
    return h;
  }, [accessToken, tenantId]);

  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newStakeholder, setNewStakeholder] = useState({
    contactId: '',
    role: 'Influencer',
    influence: 50,
    sentiment: 'Neutral',
    reportsToId: '',
    notes: '',
  });

  const { data: stakeholders = [] } = useQuery<Stakeholder[]>({
    queryKey: ['stakeholders', dealId, accessToken],
    queryFn: async () => {
      const r = await fetch(`/api/crm/deals/${dealId}/stakeholders`, {
        headers: authHeaders,
      });
      const d = (await r.json()) as { data?: Stakeholder[] };
      return d.data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: (body: typeof newStakeholder) =>
      fetch(`/api/crm/deals/${dealId}/stakeholders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          ...body,
          reportsToId: body.reportsToId || undefined,
          contactId: body.contactId.trim(),
        }),
      }).then((r) => r.json()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stakeholders', dealId] });
      setShowAdd(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Stakeholder> }) =>
      fetch(`/api/crm/deals/${dealId}/stakeholders/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stakeholders', dealId] }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/crm/deals/${dealId}/stakeholders/${id}`, {
        method: 'DELETE',
        headers: authHeaders,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stakeholders', dealId] }),
  });

  const roots = stakeholders.filter((s) => !s.reportsToId);
  const childrenOf = (pid: string) => stakeholders.filter((s) => s.reportsToId === pid);

  const renderNode = (s: Stakeholder, depth = 0): React.ReactNode => (
    <div
      key={s.id}
      className={`${depth > 0 ? 'ms-6 border-s-2 border-slate-200 ps-4 dark:border-slate-700' : ''} mt-3`}
    >
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
              {s.contact.firstName[0]}
              {s.contact.lastName[0]}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {s.contact.firstName} {s.contact.lastName}
              </p>
              {s.contact.title ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">{s.contact.title}</p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => removeMutation.mutate(s.id)}
            className="p-1 text-slate-400 hover:text-red-500"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              ROLE_COLORS[s.role] ?? 'bg-slate-100 text-slate-600'
            }`}
          >
            {s.role}
          </span>
          <select
            value={s.sentiment}
            onChange={(e) =>
              updateMutation.mutate({ id: s.id, data: { sentiment: e.target.value } })
            }
            className="cursor-pointer border-0 bg-transparent text-xs text-slate-600 dark:text-slate-400"
          >
            {SENTIMENTS.map((sent) => (
              <option key={sent} value={sent}>
                {SENTIMENT_ICONS[sent]} {sent}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Influence</span>
          <input
            type="range"
            min={0}
            max={100}
            value={s.influence}
            onChange={(e) =>
              updateMutation.mutate({ id: s.id, data: { influence: parseInt(e.target.value, 10) } })
            }
            className="flex-1 accent-indigo-600"
          />
          <span className="w-8 text-end text-xs font-medium text-slate-700 dark:text-slate-300">
            {s.influence}%
          </span>
        </div>
      </div>
      {childrenOf(s.id).map((child) => renderNode(child, depth + 1))}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">
          Stakeholder Map ({stakeholders.length})
        </h3>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Add Stakeholder
        </button>
      </div>

      {stakeholders.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-8 text-center text-slate-400 dark:border-slate-800">
          <User className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p className="text-sm">No stakeholders mapped yet</p>
        </div>
      ) : null}

      <div>{roots.map((s) => renderNode(s))}</div>

      {showAdd ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-96 space-y-4 rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Add Stakeholder</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">Contact ID</label>
                <input
                  value={newStakeholder.contactId}
                  onChange={(e) =>
                    setNewStakeholder((p) => ({ ...p, contactId: e.target.value }))
                  }
                  placeholder="cuid()"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">Role</label>
                <select
                  value={newStakeholder.role}
                  onChange={(e) => setNewStakeholder((p) => ({ ...p, role: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  {ROLES.map((rl) => (
                    <option key={rl} value={rl}>
                      {rl}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  Reports to (stakeholder ID, optional)
                </label>
                <select
                  value={newStakeholder.reportsToId}
                  onChange={(e) =>
                    setNewStakeholder((p) => ({ ...p, reportsToId: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">None (top level)</option>
                  {stakeholders.map((sx) => (
                    <option key={sx.id} value={sx.id}>
                      {sx.contact.firstName} {sx.contact.lastName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newStakeholder.contactId.trim() || addMutation.isPending}
                onClick={() => addMutation.mutate(newStakeholder)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {addMutation.isPending ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
