'use client';

import { useState } from 'react';
import { AlertTriangle, CopyCheck, Gauge, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useDataQualitySummary,
  type DataQualityEntityType,
} from '@/hooks/use-data-quality';

/**
 * Read-only data-quality dashboard. Reads
 * GET /data-quality/summary?entityType=account|contact and renders summary
 * cards plus a field-completeness bar list. Degrades to an empty state when
 * the endpoint is unavailable (hook returns null).
 */
export default function DataQualityPage() {
  const [entityType, setEntityType] = useState<DataQualityEntityType>('account');
  const summaryQuery = useDataQualitySummary(entityType);
  const summary = summaryQuery.data;

  const completeness = summary
    ? Object.entries(summary.fieldCompleteness ?? {}).sort((a, b) => a[1] - b[1])
    : [];

  return (
    <div className="space-y-5 px-6 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Data Quality</h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
            Health of your CRM records — completeness, quality scoring, and duplicate exposure.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-outline-variant bg-surface-container-low p-1">
          {(['account', 'contact'] as DataQualityEntityType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setEntityType(type)}
              className={cn(
                'inline-flex h-9 items-center rounded-md px-4 text-xs font-bold capitalize transition',
                entityType === type
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface'
              )}
            >
              {type}s
            </button>
          ))}
        </div>
      </div>

      {summaryQuery.isLoading ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : !summary ? (
        <div className="rounded-lg border border-outline-variant bg-surface">
          <EmptyState
            icon="📊"
            title="No data-quality summary available"
            description="Data-quality metrics will appear here once the service is reporting for this entity."
          />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              icon={Gauge}
              tone="blue"
              label="Avg. quality score"
              value={`${Math.round(summary.avgQualityScore ?? 0)}`}
              note={`Across ${(summary.totalRecords ?? 0).toLocaleString()} ${entityType}s`}
            />
            <SummaryCard
              icon={AlertTriangle}
              tone="amber"
              label="Low-quality records"
              value={(summary.lowQualityCount ?? 0).toLocaleString()}
              note="Below the quality threshold"
            />
            <SummaryCard
              icon={CopyCheck}
              tone="rose"
              label="Open duplicate groups"
              value={(summary.openDuplicateGroups ?? 0).toLocaleString()}
              note="Awaiting merge or dismissal"
            />
          </div>

          <section className="rounded-xl border border-outline-variant bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-bold text-on-surface">Field completeness</h2>
            <p className="mt-1 text-xs text-on-surface-variant">
              Percentage of {entityType}s with a value in each field.
            </p>
            {completeness.length === 0 ? (
              <p className="mt-6 text-center text-sm text-on-surface-variant">
                No field-completeness data reported.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {completeness.map(([field, percent]) => (
                  <CompletenessBar key={field} field={field} percent={percent} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  tone,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  tone: 'blue' | 'amber' | 'rose';
  label: string;
  value: string;
  note: string;
}) {
  const tones = {
    blue: { bar: 'from-primary to-info', badge: 'border-primary/30 bg-primary-container text-primary' },
    amber: { bar: 'from-warning to-warning', badge: 'border-warning/30 bg-warning-container text-warning' },
    rose: { bar: 'from-error to-tertiary', badge: 'border-error/30 bg-error-container text-error' },
  }[tone];
  return (
    <div className="overflow-hidden rounded-lg border border-[#e7edf3] bg-[#f9f9ff]">
      <div className={cn('h-1.5 bg-gradient-to-r', tones.bar)} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase text-on-surface-variant">{label}</p>
          <span className={cn('rounded-lg border p-2', tones.badge)}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-3 text-2xl font-bold text-on-surface">{value}</p>
        <p className="mt-1 text-sm text-on-surface-variant">{note}</p>
      </div>
    </div>
  );
}

function CompletenessBar({ field, percent }: { field: string; percent: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const barColor = pct >= 80 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-error';
  return (
    <li>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-on-surface">{field}</span>
        <span className="tabular-nums text-on-surface-variant">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
        <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}
