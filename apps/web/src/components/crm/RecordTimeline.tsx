'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GitCommitVertical } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { timelineMeta } from '@/lib/timeline-icons';
import { formatDateTime } from '@/lib/format';

/**
 * Vertical, chronologically-merged timeline for a single record: the record's
 * activities merged with its field-history (`/api/crm/history/:type/:id` →
 * crm-service `/history/:objectType/:objectId`), rendered with typed pips and a
 * continuous connector rail (pure CSS/SVG — no chart/timeline dependency).
 *
 * Data sources:
 * - Activities: passed in by the parent (it already loads them for its tab).
 * - Field history: fetched here from the shared CRM history BFF route.
 */

export interface TimelineActivity {
  id: string;
  type: string;
  subject: string;
  /** ISO datetime used for ordering (due date preferred, else created). */
  at: string;
  description?: string;
  status?: string;
}

interface HistoryEntry {
  id: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedByName?: string | null;
  changedAt: string;
}

type MergedItem =
  | { kind: 'activity'; id: string; at: number; atLabel: string; data: TimelineActivity }
  | { kind: 'history'; id: string; at: number; atLabel: string; data: HistoryEntry };

export interface RecordTimelineProps {
  /** CRM object type for the history endpoint, e.g. `deal`, `account`. */
  objectType: string;
  objectId: string;
  activities: TimelineActivity[];
  activitiesLoading?: boolean;
}

export function RecordTimeline({
  objectType,
  objectId,
  activities,
  activitiesLoading = false,
}: RecordTimelineProps): JSX.Element {
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = {};
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    if (tenantId) h['x-tenant-id'] = tenantId;
    return h;
  }, [accessToken, tenantId]);

  const historyQuery = useQuery<HistoryEntry[]>({
    queryKey: ['record-timeline-history', objectType, objectId, accessToken],
    enabled: Boolean(objectId),
    queryFn: async () => {
      const r = await fetch(`/api/crm/history/${objectType}/${objectId}`, { headers: authHeaders });
      if (!r.ok) return [];
      const json = (await r.json().catch(() => ({}))) as { data?: HistoryEntry[] };
      return Array.isArray(json.data) ? json.data : [];
    },
    // History is a best-effort enhancement; a failure should not blow up the tab.
    retry: false,
  });

  const merged = useMemo<MergedItem[]>(() => {
    const toTime = (iso: string): number => {
      const t = new Date(iso).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    const items: MergedItem[] = [];
    for (const a of activities) {
      items.push({ kind: 'activity', id: `a-${a.id}`, at: toTime(a.at), atLabel: a.at, data: a });
    }
    for (const h of historyQuery.data ?? []) {
      items.push({ kind: 'history', id: `h-${h.id}`, at: toTime(h.changedAt), atLabel: h.changedAt, data: h });
    }
    return items.sort((x, y) => y.at - x.at);
  }, [activities, historyQuery.data]);

  const isLoading = activitiesLoading || historyQuery.isLoading;

  if (isLoading && merged.length === 0) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-container-high" />
        ))}
      </div>
    );
  }

  if (merged.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-8 text-center">
        <p className="text-sm font-medium text-on-surface">No history yet</p>
        <p className="mt-1 text-xs text-on-surface-variant">
          Activities and field changes for this record will appear here as they happen.
        </p>
      </div>
    );
  }

  return (
    <div className="relative pl-2" data-testid="record-timeline">
      {/* Continuous connector rail. */}
      <div
        aria-hidden
        className="absolute bottom-2 left-[15px] top-2 w-px bg-outline-variant"
      />
      <ol className="space-y-4">
        {merged.map((item) => (
          <li key={item.id} className="relative flex gap-3">
            <span
              className="relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-outline-variant bg-surface"
              aria-hidden
            >
              {item.kind === 'activity' ? (
                timelineMeta(item.data as unknown as Record<string, unknown>).icon
              ) : (
                <GitCommitVertical className="h-4 w-4 text-warning" />
              )}
            </span>
            <div className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface p-3">
              {item.kind === 'activity' ? (
                <ActivityRow data={item.data} />
              ) : (
                <HistoryRow data={item.data} />
              )}
              <p className="mt-1.5 text-xs text-on-surface-variant">{formatDateTime(item.atLabel)}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ActivityRow({ data }: { data: TimelineActivity }) {
  const meta = timelineMeta(data as unknown as Record<string, unknown>);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-on-surface">{data.subject}</p>
        <span className="rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-on-surface-variant">
          {meta.label}
        </span>
        {data.status ? (
          <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold uppercase text-on-surface-variant">
            {data.status}
          </span>
        ) : null}
      </div>
      {data.description ? (
        <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant">{data.description}</p>
      ) : null}
    </>
  );
}

function HistoryRow({ data }: { data: HistoryEntry }) {
  return (
    <>
      <p className="text-sm text-on-surface">
        <span className="font-medium">{data.changedByName ?? data.changedBy ?? 'Someone'}</span>
        {' changed '}
        <span className="font-medium text-primary">{data.fieldName}</span>
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        {data.oldValue ? (
          <span className="rounded bg-error-container px-1.5 py-0.5 text-error line-through">{data.oldValue}</span>
        ) : null}
        {data.oldValue && data.newValue ? <span className="text-on-surface-variant">→</span> : null}
        {data.newValue ? (
          <span className="rounded bg-success-container px-1.5 py-0.5 text-success">{data.newValue}</span>
        ) : null}
        {!data.oldValue && !data.newValue ? <span className="italic text-on-surface-variant">cleared</span> : null}
      </div>
    </>
  );
}
