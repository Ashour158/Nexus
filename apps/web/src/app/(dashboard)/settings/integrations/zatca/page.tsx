'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

type UiStatus = 'PENDING' | 'CLEARED' | 'REJECTED' | 'ERROR';

interface ZatcaSubmissionRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  zatcaUuid?: string | null;
  zatcaUUID?: string | null;
  submittedAt: string;
  updatedAt?: string;
}

function normalizeStatus(raw: string): UiStatus {
  const s = raw.toUpperCase();
  if (s === 'CLEARED' || s === 'REPORTED') return 'CLEARED';
  if (s === 'PENDING') return 'PENDING';
  if (s === 'REJECTED') return 'REJECTED';
  if (s === 'ERROR' || s === 'NOT_COMPLIANT') return 'ERROR';
  return 'PENDING';
}

const STATUS_CONFIG: Record<
  UiStatus,
  { icon: typeof CheckCircle2; color: string; label: string }
> = {
  CLEARED: { icon: CheckCircle2, color: 'text-success bg-success-container', label: 'Cleared' },
  PENDING: { icon: Clock, color: 'text-warning bg-warning-container', label: 'Pending' },
  REJECTED: { icon: XCircle, color: 'text-error bg-error-container', label: 'Rejected' },
  ERROR: { icon: AlertTriangle, color: 'text-warning bg-warning-container', label: 'Error' },
};

export default function ZatcaStatusPage(): JSX.Element {
  const accessToken = useAuthStore((s) => s.accessToken);
  const tenantId = useAuthStore((s) => s.tenantId);
  const headers = {
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    'x-tenant-id': tenantId ?? 'default',
  };
  const qc = useQueryClient();

  const submissionsQuery = useQuery({
    queryKey: ['zatca-submissions'],
    queryFn: async () => {
      const res = await fetch('/api/finance/invoices/zatca/list', { headers });
      const json = await res.json();
      if (!res.ok) throw new Error('Failed to load submissions');
      return (json.data ?? []) as ZatcaSubmissionRow[];
    },
    refetchInterval: 30_000,
  });

  const resubmit = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await fetch(`/api/finance/invoices/${invoiceId}/zatca`, {
        method: 'POST',
        headers,
      });
      return res.json();
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['zatca-submissions'] }),
  });

  const submissions = submissionsQuery.data ?? [];
  const normalized = submissions.map((s) => ({
    ...s,
    uiStatus: normalizeStatus(s.status),
    uuid: s.zatcaUUID ?? s.zatcaUuid ?? null,
    clearedAt: normalizeStatus(s.status) === 'CLEARED' ? s.updatedAt : null,
  }));

  const cleared = normalized.filter((s) => s.uiStatus === 'CLEARED').length;
  const pending = normalized.filter((s) => s.uiStatus === 'PENDING').length;
  const rejected = normalized.filter((s) => s.uiStatus === 'REJECTED' || s.uiStatus === 'ERROR').length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">ZATCA e-Invoicing</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Saudi Phase 2 clearance status for submitted invoices</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-success/30 bg-success-container p-4">
          <div className="text-2xl font-bold text-success">{cleared}</div>
          <div className="mt-1 text-sm text-success">Cleared</div>
        </div>
        <div className="rounded-xl border border-warning/30 bg-warning-container p-4">
          <div className="text-2xl font-bold text-warning">{pending}</div>
          <div className="mt-1 text-sm text-warning">Pending clearance</div>
        </div>
        <div className="rounded-xl border border-error/30 bg-error-container p-4">
          <div className="text-2xl font-bold text-error">{rejected}</div>
          <div className="mt-1 text-sm text-error">Rejected / Error</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
        <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
          <h2 className="text-sm font-semibold text-on-surface">Submission History</h2>
          <button
            type="button"
            onClick={() => void qc.invalidateQueries({ queryKey: ['zatca-submissions'] })}
            className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-on-surface"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {submissionsQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-on-surface-variant">Loading submissions…</div>
        ) : normalized.length === 0 ? (
          <div className="p-8 text-center text-sm text-on-surface-variant">
            No ZATCA submissions yet. Submit an invoice from the Invoices page.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-xs font-medium uppercase text-on-surface-variant">
              <tr>
                <th className="px-5 py-3 text-start">Invoice</th>
                <th className="px-5 py-3 text-start">Status</th>
                <th className="px-5 py-3 text-start">ZATCA UUID</th>
                <th className="px-5 py-3 text-start">Cleared / updated</th>
                <th className="px-5 py-3 text-start">Submitted</th>
                <th className="px-5 py-3 text-start">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {normalized.map((s) => {
                const cfg = STATUS_CONFIG[s.uiStatus] ?? STATUS_CONFIG.ERROR;
                const Icon = cfg.icon;
                const uuidDisplay = s.uuid?.slice(0, 16);
                return (
                  <tr key={s.id} className="hover:bg-surface-container-low">
                    <td className="px-5 py-3 font-medium text-on-surface">{s.invoiceNumber}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-on-surface-variant">{uuidDisplay ? `${uuidDisplay}…` : '—'}</td>
                    <td className="px-5 py-3 text-on-surface-variant">
                      {s.clearedAt ? new Date(s.clearedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3 text-on-surface-variant">{new Date(s.submittedAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3">
                      {(s.uiStatus === 'REJECTED' || s.uiStatus === 'ERROR') && (
                        <button
                          type="button"
                          onClick={() => resubmit.mutate(s.invoiceId)}
                          disabled={resubmit.isPending}
                          className="text-xs font-medium text-primary hover:text-on-primary-container disabled:opacity-50"
                        >
                          Resubmit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
