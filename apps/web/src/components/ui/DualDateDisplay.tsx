'use client';

import { formatDualDate } from '@/lib/hijri';

type Props = {
  date: Date | string;
  showHijri?: boolean;
  className?: string;
};

export function DualDateDisplay({ date, showHijri = false, className = '' }: Props) {
  const { gregorian, hijri } = formatDualDate(date);
  const isRtl =
    typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span className="text-slate-800 dark:text-slate-200">
        {isRtl ? `${hijri.day}/${hijri.month}/${hijri.year}` : gregorian}
      </span>
      {showHijri && (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {isRtl ? gregorian : hijri.formatted}
        </span>
      )}
    </span>
  );
}
