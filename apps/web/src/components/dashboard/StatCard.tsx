'use client';

import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  icon: React.ReactNode;
  iconBg?: string;
  format?: 'currency' | 'percent' | 'number';
}

function formatValue(value: string | number, format: StatCardProps['format']) {
  if (typeof value === 'string') return value;
  if (format === 'currency') return formatCurrency(value);
  if (format === 'percent') return `${value.toFixed(1)}%`;
  return value.toLocaleString();
}

export function StatCard({
  label,
  value,
  delta,
  deltaLabel = 'vs previous period',
  icon,
  iconBg = 'bg-blue-100 text-blue-700',
  format = 'number',
}: StatCardProps) {
  const positive = (delta ?? 0) > 0;
  const neutral = (delta ?? 0) === 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatValue(value, format)}</p>
        </div>
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${iconBg}`}>{icon}</span>
      </div>
      {typeof delta === 'number' ? (
        <div className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold ${neutral ? 'text-gray-500' : positive ? 'text-emerald-600' : 'text-rose-600'}`}>
          {positive ? <TrendingUp className="h-3 w-3" /> : null}
          {!positive && !neutral ? <TrendingDown className="h-3 w-3" /> : null}
          {neutral ? <Minus className="h-3 w-3 text-gray-400" /> : null}
          <span>{Math.abs(delta).toFixed(1)}%</span>
          <span className="font-normal text-slate-500">{deltaLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
