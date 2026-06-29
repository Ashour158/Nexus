'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, User } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

type HistoryEntry = {
  id: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedByName?: string | null;
  changedAt: string;
};

export function FieldHistory({
  objectType,
  objectId,
}: {
  objectType: string;
  objectId: string;
}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);
  const authHeaders = useMemo(() => {
    const h: Record<string, string> = {};
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    if (tenantId) h['x-tenant-id'] = tenantId;
    return h;
  }, [accessToken, tenantId]);

  const { data: history = [], isLoading } = useQuery<HistoryEntry[]>({
    queryKey: ['field-history', objectType, objectId, accessToken],
    enabled: Boolean(objectId),
    queryFn: async () => {
      const r = await fetch(`/api/crm/history/${objectType}/${objectId}`, {
        headers: authHeaders,
      });
      const json = (await r.json()) as { data?: HistoryEntry[] };
      return json.data ?? [];
    },
  });

  if (isLoading)
    return <div className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />;
  if (history.length === 0)
    return <p className="py-4 text-center text-sm text-slate-400">No changes recorded yet</p>;

  return (
    <div className="space-y-2">
      {history.map((entry) => (
        <div key={entry.id} className="flex items-start gap-3 text-sm">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <User className="h-3 w-3 text-slate-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-slate-700 dark:text-slate-300">
              <span className="font-medium">{entry.changedByName ?? entry.changedBy}</span>
              {' changed '}
              <span className="font-medium text-indigo-600 dark:text-indigo-400">
                {entry.fieldName}
              </span>
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
              {entry.oldValue ? (
                <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-600 line-through dark:bg-red-950/30 dark:text-red-400">
                  {entry.oldValue}
                </span>
              ) : null}
              {entry.oldValue && entry.newValue ? <span className="text-slate-400">→</span> : null}
              {entry.newValue ? (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                  {entry.newValue}
                </span>
              ) : null}
              {!entry.newValue && !entry.oldValue ? (
                <span className="italic text-slate-400">cleared</span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
            <Clock className="h-3 w-3" />
            {new Date(entry.changedAt).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}
