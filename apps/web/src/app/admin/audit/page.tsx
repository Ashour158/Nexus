'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';

const OPERATION_TYPES = [
  'all',
  'cpq.transition.reconcile',
  'quoteProjection.replay',
  'financeTimeline.replay',
  'financeTimeline.idempotency_backfill_execute',
] as const;

const STATUSES = [
  'all',
  'completed',
  'completed_with_warnings',
  'dry_run',
  'blocked',
  'failed',
  'audit_required_failed',
] as const;

const SOURCE_SERVICES = ['all', 'finance-service', 'deals-service', 'crm-service'] as const;
const TARGETS = ['all', 'cpq', 'quoteProjection', 'financeTimeline'] as const;
const TIME_RANGES = ['all', '24h', '7d'] as const;

const QUICK_FILTERS = [
  { label: 'Failed operations', status: 'failed' },
  { label: 'Blocked operations', status: 'blocked' },
  { label: 'Completed with warnings', status: 'completed_with_warnings' },
  { label: 'Backfill executions', operationType: 'financeTimeline.idempotency_backfill_execute' },
  { label: 'Replay operations', operationType: 'quoteProjection.replay' },
  { label: 'Reconciliation operations', operationType: 'cpq.transition.reconcile' },
  { label: 'Last 24 hours', timeRange: '24h' },
  { label: 'Last 7 days', timeRange: '7d' },
] as const;

type OperationAuditRecord = {
  auditId: string;
  tenantId: string;
  operationType: string;
  operationId: string | null;
  operatorId: string | null;
  sourceService: string | null;
  targetDomain: string | null;
  targetProjection: string | null;
  dryRun: boolean | null;
  executed: boolean | null;
  reason: string | null;
  filtersSummary: Record<string, unknown>;
  counts: Record<string, unknown>;
  status: string | null;
  warnings: string[];
  errors: string[];
  correlationId: string | null;
  createdAt: string | null;
  completedAt: string | null;
};

type AuditResponse = {
  success: boolean;
  data?: {
    records?: OperationAuditRecord[];
    pageInfo?: { nextCursor?: string | null };
  };
  error?: { message?: string };
};

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function compactObject(value: Record<string, unknown>): string {
  const entries = Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== '');
  if (!entries.length) return '-';
  return entries
    .slice(0, 4)
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(' · ');
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function getRangeStart(range: string): string | null {
  const now = Date.now();
  if (range === '24h') return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  if (range === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  return null;
}

export default function AuditLogPage() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const tenantId = useAuthStore((state) => state.tenantId);
  const roles = useAuthStore((state) => state.roles ?? []);
  const permissions = useAuthStore((state) => state.permissions ?? []);
  const [query, setQuery] = useState('');
  const [operationType, setOperationType] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [executed, setExecuted] = useState<string>('all');
  const [sourceService, setSourceService] = useState<string>('all');
  const [targetDomain, setTargetDomain] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('all');
  const [records, setRecords] = useState<OperationAuditRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedRoles = roles.map((role) => role.toLowerCase());
  const canReadAudit =
    normalizedRoles.includes('admin') ||
    permissions.includes('*') ||
    permissions.includes('audit:read') ||
    permissions.includes('admin:*');

  useEffect(() => {
    if (!canReadAudit) {
      setRecords([]);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set('limit', '100');
    if (tenantId) params.set('tenantId', tenantId);
    if (operationType !== 'all') params.set('operationType', operationType);
    if (status !== 'all') params.set('status', status);
    if (executed !== 'all') params.set('executed', executed);
    if (sourceService !== 'all') params.set('sourceService', sourceService);
    if (targetDomain !== 'all') params.set('targetDomain', targetDomain);
    const from = getRangeStart(timeRange);
    if (from) params.set('from', from);
    if (query.trim()) {
      const trimmed = query.trim();
      if (trimmed.startsWith('corr-')) params.set('correlationId', trimmed);
      else if (trimmed.startsWith('op-')) params.set('operationId', trimmed);
      else params.set('operatorId', trimmed);
    }
    if (cursor) params.set('cursor', cursor);

    setLoading(true);
    setError(null);
    fetch(`/api/admin/audit/internal-operations?${params.toString()}`, {
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
      },
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as AuditResponse;
        if (!res.ok || !body.success) {
          throw new Error(body.error?.message ?? 'Audit records could not be loaded');
        }
        setRecords(body.data?.records ?? []);
        setNextCursor(body.data?.pageInfo?.nextCursor ?? null);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setRecords([]);
        setError(err instanceof Error ? err.message : 'Audit records could not be loaded');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [accessToken, canReadAudit, cursor, executed, operationType, query, sourceService, status, targetDomain, tenantId, timeRange]);

  const filteredRecords = useMemo(() => records, [records]);
  const summary = useMemo(() => {
    const failed = filteredRecords.filter((record) => record.status === 'failed' || record.status === 'audit_required_failed').length;
    const blocked = filteredRecords.filter((record) => record.status === 'blocked').length;
    const completed = filteredRecords.filter((record) => record.status === 'completed').length;
    const warnings = filteredRecords.filter(
      (record) => record.status === 'completed_with_warnings' || record.warnings.length > 0
    ).length;
    const dryRuns = filteredRecords.filter((record) => record.dryRun === true || record.executed === false).length;
    const executedCount = filteredRecords.filter((record) => record.executed === true).length;
    const topOperationTypes = Object.entries(
      filteredRecords.reduce<Record<string, number>>((acc, record) => {
        acc[record.operationType] = (acc[record.operationType] ?? 0) + 1;
        return acc;
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => `${type} (${count})`)
      .join(', ');

    return {
      total: filteredRecords.length,
      failed,
      blocked,
      completed,
      warnings,
      dryRuns,
      executedCount,
      topOperationTypes: topOperationTypes || '-',
    };
  }, [filteredRecords]);

  function resetCursorAndSet(update: () => void) {
    setCursor(null);
    update();
  }

  function applyQuickFilter(filter: (typeof QUICK_FILTERS)[number]) {
    resetCursorAndSet(() => {
      if ('operationType' in filter) setOperationType(filter.operationType);
      if ('status' in filter) setStatus(filter.status);
      if ('timeRange' in filter) setTimeRange(filter.timeRange);
    });
  }

  function exportCsv() {
    if (!filteredRecords.length) return;
    const header = [
      'createdAt',
      'operationType',
      'operationId',
      'operatorId',
      'sourceService',
      'target',
      'dryRun',
      'executed',
      'status',
      'reason',
      'counts',
      'warnings',
      'errors',
      'correlationId',
    ];
    const body = filteredRecords.map((record) =>
      [
        record.createdAt,
        record.operationType,
        record.operationId,
        record.operatorId,
        record.sourceService,
        record.targetDomain ?? record.targetProjection,
        record.dryRun,
        record.executed,
        record.status,
        record.reason,
        compactObject(record.counts),
        record.warnings.join('; '),
        record.errors.join('; '),
        record.correlationId,
      ]
        .map(csvEscape)
        .join(',')
    );
    const blob = new Blob([[header.join(','), ...body].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'internal-operation-audit.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!canReadAudit) {
    return (
      <div className="rounded-xl border border-amber-700 bg-amber-950/40 p-6 text-sm text-amber-100">
        You need admin or audit read permission to view operation audit records.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Audit Log</h2>
        <p className="mt-1 text-sm text-gray-400">
          Internal replay and reconciliation operation records from the durable audit stream.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => applyQuickFilter(filter)}
            className="rounded border border-gray-700 px-3 py-1 text-xs text-gray-200 hover:bg-gray-800"
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="grid gap-2 rounded-xl border border-gray-800 bg-gray-900 p-3 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Search
          <input
            value={query}
            onChange={(event) => resetCursorAndSet(() => setQuery(event.target.value))}
            placeholder="operator, op-, corr-"
            className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Operation type
          <select
            aria-label="Operation type"
            value={operationType}
            onChange={(event) => resetCursorAndSet(() => setOperationType(event.target.value))}
            className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
          >
            {OPERATION_TYPES.map((item) => (
              <option key={item} value={item}>
                {item === 'all' ? 'All operations' : item}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Status
          <select
            aria-label="Status"
            value={status}
            onChange={(event) => resetCursorAndSet(() => setStatus(event.target.value))}
            className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
          >
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item === 'all' ? 'All statuses' : item}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Execution
          <select
            aria-label="Execution"
            value={executed}
            onChange={(event) => resetCursorAndSet(() => setExecuted(event.target.value))}
            className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
          >
            <option value="all">All</option>
            <option value="true">Executed</option>
            <option value="false">Dry-run only</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Source service
          <select
            aria-label="Source service"
            value={sourceService}
            onChange={(event) => resetCursorAndSet(() => setSourceService(event.target.value))}
            className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
          >
            {SOURCE_SERVICES.map((item) => (
              <option key={item} value={item}>
                {item === 'all' ? 'All services' : item}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Target
          <select
            aria-label="Target"
            value={targetDomain}
            onChange={(event) => resetCursorAndSet(() => setTargetDomain(event.target.value))}
            className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
          >
            {TARGETS.map((item) => (
              <option key={item} value={item}>
                {item === 'all' ? 'All targets' : item}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">
          Time range
          <select
            aria-label="Time range"
            value={timeRange}
            onChange={(event) => resetCursorAndSet(() => setTimeRange(event.target.value))}
            className="rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
          >
            {TIME_RANGES.map((item) => (
              <option key={item} value={item}>
                {item === 'all' ? 'All time' : item === '24h' ? 'Last 24 hours' : 'Last 7 days'}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!filteredRecords.length}
          className="self-end rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs text-gray-500">Current results</p>
          <p className="text-xl font-semibold text-gray-100">{summary.total}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs text-gray-500">Attention</p>
          <p className="text-sm text-gray-100">{summary.failed} failed</p>
          <p className="text-sm text-gray-100">{summary.blocked} blocked</p>
          <p className="text-sm text-gray-100">{summary.warnings} warning</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs text-gray-500">Mode</p>
          <p className="text-sm text-gray-100">{summary.executedCount} executed</p>
          <p className="text-sm text-gray-100">{summary.dryRuns} dry-run</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
          <p className="text-xs text-gray-500">Top operation types</p>
          <p className="text-sm text-gray-100">{summary.topOperationTypes}</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-400">Loading operation audit records...</p>
      ) : !filteredRecords.length ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-sm text-gray-300">No internal operation audit records found.</p>
          <p className="mt-1 text-xs text-gray-500">
            Replay and reconciliation audit events will appear here after the audit consumer stores them.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Operation</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Counts</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredRecords.map((record) => (
                  <tr key={record.auditId}>
                    <td className="px-3 py-3 whitespace-nowrap text-gray-300">{formatDate(record.createdAt)}</td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-gray-100">{record.operationType}</p>
                      <p className="font-mono text-xs text-gray-500">{record.operationId ?? '-'}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p>{record.operatorId ?? 'system'}</p>
                      <p className="text-xs text-gray-500">{record.sourceService ?? '-'}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p>{record.targetDomain ?? record.targetProjection ?? '-'}</p>
                      <p className="font-mono text-xs text-gray-500">{record.correlationId ?? '-'}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded bg-gray-800 px-2 py-1 text-xs">
                        {record.executed ? 'executed' : record.dryRun ? 'dry-run' : 'reported'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded bg-blue-950 px-2 py-1 text-xs text-blue-100">
                        {record.status ?? '-'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-300">{compactObject(record.counts)}</td>
                    <td className="px-3 py-3 text-xs text-gray-300">
                      <p>{record.reason ?? '-'}</p>
                      {record.warnings.length ? <p className="mt-1 text-amber-300">{record.warnings.join('; ')}</p> : null}
                      {record.errors.length ? <p className="mt-1 text-red-300">{record.errors.join('; ')}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={!cursor}
              onClick={() => setCursor(null)}
              className="rounded border border-gray-700 px-3 py-1 text-sm disabled:opacity-50"
            >
              First page
            </button>
            <button
              type="button"
              disabled={!nextCursor}
              onClick={() => setCursor(nextCursor)}
              className="rounded border border-gray-700 px-3 py-1 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
