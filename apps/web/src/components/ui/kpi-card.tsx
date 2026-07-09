'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { Sparkline } from '@/components/dashboard/Sparkline';

interface KpiCardProps {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  sparklineData?: number[];
  format?: 'currency' | 'percent' | 'number';
  className?: string;
}

function formatValue(value: string | number, format: KpiCardProps['format']) {
  if (typeof value === 'string') return value;
  if (format === 'currency') return formatCurrency(value);
  if (format === 'percent') return `${value.toFixed(1)}%`;
  return value.toLocaleString();
}

export function KpiCard({
  label,
  value,
  delta,
  deltaLabel = 'vs previous period',
  sparklineData,
  format = 'number',
  className,
}: KpiCardProps) {
  const positive = (delta ?? 0) > 0;
  const neutral = (delta ?? 0) === 0;

  return (
    <div
      className={cn(
        'rounded-xl border p-5 transition-shadow hover:shadow-sm',
        'bg-surface border-border-color',
        className
      )}
      style={{
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            {label}
          </p>
          <p
            className="mt-2 text-2xl font-bold truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {formatValue(value, format)}
          </p>
        </div>
        {sparklineData && sparklineData.length > 0 ? (
          <div className="shrink-0">
            <Sparkline
              data={sparklineData}
              color={positive || neutral ? '#4F6CF7' : '#EF4444'}
              width={100}
              height={32}
            />
          </div>
        ) : null}
      </div>
      {typeof delta === 'number' ? (
        <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold">
          {positive ? (
            <TrendingUp className="h-3 w-3 text-emerald-600" />
          ) : !positive && !neutral ? (
            <TrendingDown className="h-3 w-3 text-rose-600" />
          ) : (
            <Minus className="h-3 w-3 text-gray-400" />
          )}
          <span className={neutral ? 'text-gray-500' : positive ? 'text-emerald-600' : 'text-rose-600'}>
            {Math.abs(delta).toFixed(1)}%
          </span>
          <span style={{ color: 'var(--text-muted)' }} className="font-normal">
            {deltaLabel}
          </span>
        </div>
      ) : null}
    </div>
  );
}
