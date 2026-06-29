'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { CheckCircle2, Circle, Plus, Copy } from 'lucide-react';

type ActionItem = {
  id: string;
  title: string;
  owner: 'rep' | 'buyer';
  ownerName?: string | null;
  dueDate?: string | Date | null;
  completedAt?: string | Date | null;
  position: number;
};
type DealRoomDoc = { id: string; name: string; url: string; fileType?: string | null };

type DealRoom = {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  buyerEmails: unknown;
  viewCount: number;
  items: ActionItem[];
  documents: DealRoomDoc[];
};

export function DealRoomPanel({ dealId }: { dealId: string }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);
  const authHeaders = useMemo(() => {
    const h: Record<string, string> = {};
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    if (tenantId) h['x-tenant-id'] = tenantId;
    return h;
  }, [accessToken, tenantId]);

  const qc = useQueryClient();
  const [newItem, setNewItem] = useState({
    title: '',
    owner: 'rep' as 'rep' | 'buyer',
    ownerName: '',
    dueDate: '',
  });
  const [showCopied, setShowCopied] = useState(false);

  const { data: room, isLoading } = useQuery<DealRoom | null>({
    queryKey: ['deal-room', dealId, accessToken],
    queryFn: async () => {
      const r = await fetch(`/api/crm/deals/${dealId}/room`, { headers: authHeaders });
      const d = (await r.json()) as { data?: DealRoom | null };
      return d.data ?? null;
    },
  });

  const updateRoom = useMutation({
    mutationFn: (partial: Partial<DealRoom>) =>
      fetch(`/api/crm/deals/${dealId}/room`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify(partial),
      }).then((r) => r.json()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['deal-room', dealId] }),
  });

  const addItem = useMutation({
    mutationFn: (item: typeof newItem) =>
      fetch(`/api/crm/deals/${dealId}/room/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          title: item.title,
          owner: item.owner,
          ownerName: item.ownerName || undefined,
          dueDate: item.dueDate ? new Date(item.dueDate).toISOString() : undefined,
        }),
      }).then((r) => r.json()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['deal-room', dealId] });
      setNewItem({ title: '', owner: 'rep', ownerName: '', dueDate: '' });
    },
  });

  const toggleItem = useMutation({
    mutationFn: ({ id, completedAt }: { id: string; completedAt: string | null }) =>
      fetch(`/api/crm/deals/${dealId}/room/items/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({ completedAt }),
      }).then((r) => r.json()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['deal-room', dealId] }),
  });

  function copyLink() {
    if (!room) return;
    const url = `${window.location.origin}/deal-room/${room.slug}`;
    void navigator.clipboard.writeText(url).then(() => {
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    });
  }

  if (isLoading)
    return <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />;
  if (!room) return null;

  const repItems = room.items.filter((i) => i.owner === 'rep');
  const buyerItems = room.items.filter((i) => i.owner === 'buyer');
  const progress =
    room.items.length > 0
      ? Math.round(
          (room.items.filter((i) => Boolean(i.completedAt)).length / room.items.length) * 100
        )
      : 0;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">Deal Room</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Copy className="h-3 w-3" /> {showCopied ? 'Copied!' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={() => updateRoom.mutate({ isPublished: !room.isPublished })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                room.isPublished
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {room.isPublished ? '✓ Published' : 'Publish'}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="w-10 text-end text-xs font-medium text-slate-600 dark:text-slate-400">
            {progress}%
          </span>
        </div>
        {room.viewCount > 0 ? (
          <p className="text-xs text-slate-400">👁 Viewed {room.viewCount} times</p>
        ) : null}
      </div>

      {(['rep', 'buyer'] as const).map((ownerType) => (
        <div
          key={ownerType}
          className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <h4 className="text-sm font-medium uppercase tracking-wide text-slate-700 dark:text-slate-300">
            {ownerType === 'rep' ? '🧑‍💼 Your actions' : '🤝 Buyer actions'}
          </h4>
          {(ownerType === 'rep' ? repItems : buyerItems).map((item) => (
            <div key={item.id} className="group flex items-start gap-2">
              <button
                type="button"
                onClick={() =>
                  toggleItem.mutate({
                    id: item.id,
                    completedAt: item.completedAt ? null : new Date().toISOString(),
                  })
                }
                className="mt-0.5 flex-shrink-0"
              >
                {item.completedAt ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Circle className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 dark:text-slate-600" />
                )}
              </button>
              <div className="flex-1">
                <p
                  className={`text-sm ${
                    item.completedAt
                      ? 'text-slate-400 line-through'
                      : 'text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {item.title}
                </p>
                {item.dueDate ? (
                  <p className="text-xs text-slate-400">
                    Due{' '}
                    {new Date(
                      typeof item.dueDate === 'string' ? item.dueDate : item.dueDate
                    ).toLocaleDateString()}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
          {(ownerType === 'rep' ? repItems : buyerItems).length === 0 ? (
            <p className="text-xs italic text-slate-400">No items yet</p>
          ) : null}
        </div>
      ))}

      <div className="space-y-2 rounded-xl border border-dashed border-slate-200 p-3 dark:border-slate-700">
        <div className="flex flex-wrap gap-2">
          <input
            value={newItem.title}
            onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))}
            placeholder="Add action item…"
            className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <select
            value={newItem.owner}
            onChange={(e) =>
              setNewItem((p) => ({ ...p, owner: e.target.value as 'rep' | 'buyer' }))
            }
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="rep">You</option>
            <option value="buyer">Buyer</option>
          </select>
          <input
            type="date"
            value={newItem.dueDate}
            onChange={(e) => setNewItem((p) => ({ ...p, dueDate: e.target.value }))}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <button
            type="button"
            disabled={!newItem.title.trim() || addItem.isPending}
            onClick={() => addItem.mutate(newItem)}
            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
