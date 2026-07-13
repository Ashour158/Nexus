'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Month calendar for activities — pure CSS grid (7 columns), no calendar
 * library. Activities are placed on their due date. Clicking a day reveals that
 * day's activities and an "add" affordance. On < md the grid collapses to an
 * agenda list (task requirement). Colours come from the M3 token palette.
 */

export interface CalendarActivity {
  id: string;
  type: string;
  subject: string;
  status: string;
  dueDate: string | null;
}

export interface ActivityCalendarProps {
  activities: CalendarActivity[];
  loading?: boolean;
  /** Invoked with an ISO `yyyy-mm-dd` when the user adds on a specific day. */
  onAddOnDay?: (dayIso: string) => void;
  /** Invoked when a single activity is selected. */
  onSelectActivity?: (id: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const TYPE_DOT: Record<string, string> = {
  CALL: 'bg-success',
  EMAIL: 'bg-primary',
  MEETING: 'bg-tertiary',
  NOTE: 'bg-on-surface-variant',
  TASK: 'bg-warning',
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ActivityCalendar({
  activities,
  loading = false,
  onAddOnDay,
  onSelectActivity,
}: ActivityCalendarProps): JSX.Element {
  const today = new Date();
  const [cursor, setCursor] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarActivity[]>();
    for (const a of activities) {
      if (!a.dueDate) continue;
      const d = new Date(a.dueDate);
      if (Number.isNaN(d.getTime())) continue;
      const key = dayKey(d);
      const bucket = map.get(key);
      if (bucket) bucket.push(a);
      else map.set(key, [a]);
    }
    return map;
  }, [activities]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dayKey(today);

  const cells: Array<{ key: string; day: number } | null> = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({ key: dayKey(new Date(year, month, d)), day: d });
  }

  // Days in the visible month that have activities (for the mobile agenda).
  const agendaDays = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    return [...byDay.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .sort(([a], [b]) => (a < b ? -1 : 1));
  }, [byDay, year, month]);

  const goPrev = () => {
    setSelectedDay(null);
    setCursor(new Date(year, month - 1, 1));
  };
  const goNext = () => {
    setSelectedDay(null);
    setCursor(new Date(year, month + 1, 1));
  };
  const goToday = () => {
    setSelectedDay(todayKey);
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const selectedActivities = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-on-surface">
          {MONTHS[month]} {year}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous month"
            className="rounded-lg border border-outline-variant p-1.5 text-on-surface-variant hover:bg-surface-container-high"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface-container-high"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next month"
            className="rounded-lg border border-outline-variant p-1.5 text-on-surface-variant hover:bg-surface-container-high"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-80 animate-pulse rounded-xl bg-surface-container-high" />
      ) : (
        <>
          {/* Desktop / tablet: month grid */}
          <div className="hidden md:block">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-outline-variant bg-outline-variant">
              {WEEKDAYS.map((w) => (
                <div key={w} className="bg-surface-container-low px-2 py-2 text-center text-xs font-semibold text-on-surface-variant">
                  {w}
                </div>
              ))}
              {cells.map((cell, i) => {
                if (!cell) return <div key={`blank-${i}`} className="min-h-24 bg-surface-container-low" />;
                const dayActs = byDay.get(cell.key) ?? [];
                const isToday = cell.key === todayKey;
                const isSelected = cell.key === selectedDay;
                return (
                  <button
                    type="button"
                    key={cell.key}
                    onClick={() => setSelectedDay(isSelected ? null : cell.key)}
                    aria-pressed={isSelected}
                    className={cn(
                      'min-h-24 bg-surface p-1.5 text-left align-top transition-colors motion-reduce:transition-none hover:bg-surface-container-low',
                      isSelected && 'ring-2 ring-inset ring-primary'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                        isToday ? 'bg-primary text-on-primary' : 'text-on-surface'
                      )}
                    >
                      {cell.day}
                    </span>
                    <div className="mt-1 space-y-1">
                      {dayActs.slice(0, 3).map((a) => (
                        <div key={a.id} className="flex items-center gap-1">
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TYPE_DOT[a.type] ?? 'bg-on-surface-variant')} />
                          <span className="truncate text-[11px] text-on-surface-variant">{a.subject}</span>
                        </div>
                      ))}
                      {dayActs.length > 3 ? (
                        <span className="text-[11px] font-medium text-primary">+{dayActs.length - 3} more</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedDay ? (
              <DayPanel
                dayIso={selectedDay}
                activities={selectedActivities}
                onAddOnDay={onAddOnDay}
                onSelectActivity={onSelectActivity}
              />
            ) : (
              <p className="mt-3 text-center text-xs text-on-surface-variant">Select a day to see or add its activities.</p>
            )}
          </div>

          {/* Mobile: agenda list */}
          <div className="space-y-3 md:hidden">
            {agendaDays.length === 0 ? (
              <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-8 text-center text-sm text-on-surface-variant">
                No activities scheduled this month.
              </div>
            ) : (
              agendaDays.map(([key, acts]) => (
                <DayPanel key={key} dayIso={key} activities={acts} onAddOnDay={onAddOnDay} onSelectActivity={onSelectActivity} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DayPanel({
  dayIso,
  activities,
  onAddOnDay,
  onSelectActivity,
}: {
  dayIso: string;
  activities: CalendarActivity[];
  onAddOnDay?: (dayIso: string) => void;
  onSelectActivity?: (id: string) => void;
}) {
  const label = useMemo(() => {
    const [y, m, d] = dayIso.split('-').map(Number);
    const date = new Date(y, (m ?? 1) - 1, d ?? 1);
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }, [dayIso]);

  return (
    <div className="mt-3 rounded-xl border border-outline-variant bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-on-surface">{label}</h3>
        {onAddOnDay ? (
          <button
            type="button"
            onClick={() => onAddOnDay(dayIso)}
            className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-2 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container-high"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        ) : null}
      </div>
      {activities.length === 0 ? (
        <p className="text-xs text-on-surface-variant">No activities on this day.</p>
      ) : (
        <ul className="space-y-2">
          {activities.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onSelectActivity?.(a.id)}
                className="flex w-full items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2 text-left hover:bg-surface-container-high"
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-full', TYPE_DOT[a.type] ?? 'bg-on-surface-variant')} />
                <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{a.subject}</span>
                <span className="shrink-0 rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold uppercase text-on-surface-variant">
                  {a.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
