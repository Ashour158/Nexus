'use client';

import { Bell, CheckCircle2, MessageSquare, Phone, Trophy, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  useNotifications,
  useUnreadNotificationsCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@/hooks/use-notifications';

const TYPE_ICON: Record<string, React.ElementType> = {
  deal_won: Trophy,
  lead_assigned: UserPlus,
  deal_updated: CheckCircle2,
  task_due: Phone,
  mention: MessageSquare,
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useNotifications(5);
  const { data: unreadData } = useUnreadNotificationsCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const notifications = data?.data ?? [];
  const unreadCount = unreadData?.count ?? 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 transition-colors hover:bg-surface-container-high"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="h-5 w-5 text-on-surface-variant" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-on-primary">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute end-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
            <h3 className="text-sm font-semibold text-on-surface">Notifications</h3>
            {unreadCount > 0 ? (
              <button
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                {markAllRead.isPending ? 'Marking…' : 'Mark all read'}
              </button>
            ) : null}
          </div>

          <div className="max-h-80 divide-y divide-outline-variant overflow-y-auto">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-on-surface-variant">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-on-surface-variant">No notifications</p>
            ) : (
              notifications.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? MessageSquare;
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.isRead) markRead.mutate(n.id);
                    }}
                    className={`flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-surface-container-low ${!n.isRead ? 'bg-primary-container/40' : ''}`}
                  >
                    <span className="mt-0.5 flex-shrink-0 rounded-md bg-surface-container-high p-1">
                      <Icon className="h-4 w-4 text-on-surface-variant" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm ${!n.isRead ? 'font-semibold text-on-surface' : 'font-medium text-on-surface'}`}>
                          {n.title}
                        </p>
                        {!n.isRead ? <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary-container0" /> : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-on-surface-variant">{n.body}</p>
                      <p className="mt-1 text-[11px] text-on-surface-variant">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-outline-variant bg-surface-container-low px-4 py-2">
            <a
              href="/notifications"
              className="block w-full py-1 text-center text-xs font-medium text-primary hover:underline"
            >
              View all notifications
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
