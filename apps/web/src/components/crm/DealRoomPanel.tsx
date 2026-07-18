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
    return <div className="h-40 animate-pulse rounded-xl bg-surface-container-high dark:bg-surface-container-high" />;
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
      <div className="space-y-3 rounded-xl border border-outline-variant bg-surface p-4 dark:border-outline-variant dark:bg-surface">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-on-surface ">Deal Room</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 text-xs text-on-surface-variant hover:bg-surface-container-low dark:border-outline-variant dark:text-on-surface-variant dark:hover:bg-surface-container-highest"
            >
              <Copy className="h-3 w-3" /> {showCopied ? 'Copied!' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={() => updateRoom.mutate({ isPublished: !room.isPublished })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                room.isPublished
                  ? 'bg-success-container text-success '
                  : 'bg-surface-container-high text-on-surface-variant dark:bg-surface-container-high dark:text-on-surface-variant'
              }`}
            >
              {room.isPublished ? '✓ Published' : 'Publish'}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-high dark:bg-surface-container-high">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="w-10 text-end text-xs font-medium text-on-surface-variant dark:text-on-surface-variant">
            {progress}%
          </span>
        </div>
        {room.viewCount > 0 ? (
          <p className="text-xs text-on-surface-variant">👁 Viewed {room.viewCount} times</p>
        ) : null}
      </div>

      {(['rep', 'buyer'] as const).map((ownerType) => (
        <div
          key={ownerType}
          className="space-y-2 rounded-xl border border-outline-variant bg-surface p-4 dark:border-outline-variant dark:bg-surface"
        >
          <h4 className="text-sm font-medium uppercase tracking-wide text-on-surface dark:text-outline">
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
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <Circle className="h-4 w-4 text-outline group-hover:text-primary dark:text-on-surface-variant" />
                )}
              </button>
              <div className="flex-1">
                <p
                  className={`text-sm ${
                    item.completedAt
                      ? 'text-on-surface-variant line-through'
                      : 'text-on-surface dark:text-outline'
                  }`}
                >
                  {item.title}
                </p>
                {item.dueDate ? (
                  <p className="text-xs text-on-surface-variant">
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
            <p className="text-xs italic text-on-surface-variant">No items yet</p>
          ) : null}
        </div>
      ))}

      <div className="space-y-2 rounded-xl border border-dashed border-outline-variant p-3 dark:border-outline-variant">
        <div className="flex flex-wrap gap-2">
          <input
            value={newItem.title}
            onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))}
            placeholder="Add action item…"
            className="min-w-[12rem] flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface dark:border-outline-variant dark:bg-surface "
          />
          <select
            value={newItem.owner}
            onChange={(e) =>
              setNewItem((p) => ({ ...p, owner: e.target.value as 'rep' | 'buyer' }))
            }
            className="rounded-lg border border-outline-variant bg-surface px-2 py-2 text-sm dark:border-outline-variant dark:bg-surface "
          >
            <option value="rep">You</option>
            <option value="buyer">Buyer</option>
          </select>
          <input
            type="date"
            value={newItem.dueDate}
            onChange={(e) => setNewItem((p) => ({ ...p, dueDate: e.target.value }))}
            className="rounded-lg border border-outline-variant bg-surface px-2 py-2 text-sm dark:border-outline-variant dark:bg-surface "
          />
          <button
            type="button"
            disabled={!newItem.title.trim() || addItem.isPending}
            onClick={() => addItem.mutate(newItem)}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm text-white hover:bg-primary disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
