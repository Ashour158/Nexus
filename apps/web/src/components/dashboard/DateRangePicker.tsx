'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'custom';

export interface DateRange {
  preset: DatePreset;
  from?: string;
  to?: string;
}

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (value: DateRange) => void;
}

const PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom range' },
];

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const current = useMemo<DateRange>(() => {
    return {
      preset: (params.get('preset') as DatePreset) ?? value?.preset ?? 'this_month',
      from: params.get('from') ?? value?.from,
      to: params.get('to') ?? value?.to,
    };
  }, [params, value?.from, value?.preset, value?.to]);

  function commit(next: DateRange) {
    const qp = new URLSearchParams(params.toString());
    qp.set('preset', next.preset);
    if (next.from) qp.set('from', next.from);
    else qp.delete('from');
    if (next.to) qp.set('to', next.to);
    else qp.delete('to');
    router.replace(`${pathname}?${qp.toString()}`);
    onChange?.(next);
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={current.preset}
        onChange={(e) => commit({ ...current, preset: e.target.value as DatePreset })}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        {PRESETS.map((preset) => (
          <option key={preset.value} value={preset.value}>
            {preset.label}
          </option>
        ))}
      </select>
      {current.preset === 'custom' ? (
        <>
          <input
            type="date"
            value={current.from ?? ''}
            onChange={(e) => commit({ ...current, from: e.target.value || undefined })}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
          />
          <input
            type="date"
            value={current.to ?? ''}
            onChange={(e) => commit({ ...current, to: e.target.value || undefined })}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
          />
        </>
      ) : null}
    </div>
  );
}
