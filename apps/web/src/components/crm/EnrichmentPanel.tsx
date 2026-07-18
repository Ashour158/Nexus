'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, RefreshCw, CheckCircle2, MinusCircle, AlertTriangle, Clock } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Data-enrichment surface for an account or contact.
 *
 * - "Enrich now" → POST /api/crm/enrich/{entityType}/{id} (crm-service queues the job).
 * - Polls GET /api/crm/enrich/{entityType}/{id} for the latest EnrichmentJob and
 *   renders its status (PENDING/PROCESSING/COMPLETED/SKIPPED/FAILED/NONE).
 * - SKIPPED is expected when no provider key (Clearbit/Apollo) is configured — the
 *   backend accepts the request and marks the job skipped.
 */

type EnrichmentJob = {
  status?: string;
  confidence?: number | null;
  appliedFields?: Record<string, unknown> | null;
  errorMessage?: string | null;
  entityType?: string;
  createdAt?: string;
  updatedAt?: string;
};

const STATUS_META: Record<string, { label: string; tone: string; icon: JSX.Element; hint: string }> = {
  NONE: {
    label: 'Not enriched',
    tone: 'bg-surface-container-high text-on-surface-variant',
    icon: <MinusCircle className="h-4 w-4" />,
    hint: 'No enrichment has been run for this record yet.',
  },
  PENDING: {
    label: 'Pending',
    tone: 'bg-warning-container text-warning',
    icon: <Clock className="h-4 w-4" />,
    hint: 'Enrichment is queued and will run shortly.',
  },
  PROCESSING: {
    label: 'Processing',
    tone: 'bg-primary-container text-primary',
    icon: <RefreshCw className="h-4 w-4 animate-spin" />,
    hint: 'Contacting the data provider and applying matched fields.',
  },
  COMPLETED: {
    label: 'Completed',
    tone: 'bg-success-container text-success',
    icon: <CheckCircle2 className="h-4 w-4" />,
    hint: 'Enrichment finished. Any newly discovered fields were merged into the record.',
  },
  SKIPPED: {
    label: 'Skipped',
    tone: 'bg-surface-container-high text-on-surface-variant',
    icon: <MinusCircle className="h-4 w-4" />,
    hint: 'No enrichment provider key is configured (Clearbit/Apollo), or no match was found.',
  },
  FAILED: {
    label: 'Failed',
    tone: 'bg-error-container text-error',
    icon: <AlertTriangle className="h-4 w-4" />,
    hint: 'The enrichment provider returned an error. Try again later.',
  },
};

export function EnrichmentPanel({
  entityType,
  entityId,
  canEnrich,
}: {
  entityType: 'account' | 'contact';
  entityId: string;
  canEnrich: boolean;
}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);
  const queryClient = useQueryClient();
  const [justQueued, setJustQueued] = useState(false);

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = {};
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    if (tenantId) h['x-tenant-id'] = tenantId;
    return h;
  }, [accessToken, tenantId]);

  const statusKey = ['enrichment', entityType, entityId, accessToken] as const;

  const statusQuery = useQuery<EnrichmentJob>({
    queryKey: statusKey,
    enabled: Boolean(entityId),
    queryFn: async () => {
      const res = await fetch(`/api/crm/enrich/${entityType}/${entityId}`, { headers: authHeaders });
      const json = (await res.json().catch(() => ({}))) as { data?: EnrichmentJob } & EnrichmentJob;
      return json.data ?? json ?? { status: 'NONE' };
    },
    // Keep polling while a job is in flight so COMPLETED/SKIPPED shows up on its own.
    refetchInterval: (query) => {
      const s = (query.state.data?.status ?? '').toUpperCase();
      return s === 'PENDING' || s === 'PROCESSING' ? 2500 : false;
    },
  });

  const enrichMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/crm/enrich/${entityType}/${entityId}`, {
        method: 'POST',
        headers: authHeaders,
      });
      if (!res.ok) throw new Error('Enrichment request failed');
      return res.json().catch(() => ({}));
    },
    onSuccess: () => {
      setJustQueued(true);
      setTimeout(() => setJustQueued(false), 3000);
      // Give the async job a moment to create/advance, then refresh status.
      setTimeout(() => queryClient.invalidateQueries({ queryKey: statusKey }), 1200);
    },
  });

  const status = (statusQuery.data?.status ?? 'NONE').toUpperCase();
  const meta = STATUS_META[status] ?? STATUS_META.NONE;
  const applied = statusQuery.data?.appliedFields ?? null;
  const appliedEntries = applied && typeof applied === 'object' ? Object.entries(applied) : [];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-outline-variant bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary-container p-2 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-on-surface">Data enrichment</h3>
              <p className="mt-1 max-w-xl text-xs text-on-surface-variant">
                Fill in firmographics and contact details from external providers (Clearbit / Apollo).
                Only empty fields are filled — existing values are never overwritten.
              </p>
            </div>
          </div>
          {canEnrich ? (
            <button
              type="button"
              onClick={() => enrichMutation.mutate()}
              disabled={enrichMutation.isPending || status === 'PENDING' || status === 'PROCESSING'}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary disabled:cursor-not-allowed disabled:bg-surface-container-highest"
            >
              {enrichMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {justQueued ? 'Queued' : 'Enrich now'}
            </button>
          ) : (
            <span className="rounded-lg border border-warning/30 bg-warning-container px-3 py-2 text-xs font-medium text-warning">
              Enrichment requires update permission.
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-outline-variant pt-4">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${meta.tone}`}>
            {meta.icon}
            {meta.label}
          </span>
          {typeof statusQuery.data?.confidence === 'number' ? (
            <span className="text-xs text-on-surface-variant">
              Confidence <span className="font-semibold text-on-surface">{Math.round(Number(statusQuery.data.confidence) * 100)}%</span>
            </span>
          ) : null}
          {statusQuery.data?.updatedAt ? (
            <span className="text-xs text-on-surface-variant">
              Last run {new Date(statusQuery.data.updatedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-on-surface-variant">{meta.hint}</p>
        {statusQuery.data?.errorMessage && status === 'FAILED' ? (
          <p className="mt-2 rounded-lg bg-error-container px-3 py-2 text-xs text-error">{statusQuery.data.errorMessage}</p>
        ) : null}
      </div>

      {appliedEntries.length > 0 ? (
        <div className="rounded-xl border border-outline-variant bg-surface p-5 shadow-sm">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-on-surface-variant">Enriched fields</h4>
          <dl className="grid gap-2 sm:grid-cols-2">
            {appliedEntries.map(([key, value]) => (
              <div key={key} className="rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{key}</dt>
                <dd className="mt-0.5 break-words text-sm font-semibold text-on-surface">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
