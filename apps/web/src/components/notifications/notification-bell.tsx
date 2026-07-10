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
        className="relative rounded-lg p-2 transition-colors hover:bg-gray-100"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="h-5 w-5 text-gray-600" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute end-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 ? (
              <button
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50"
              >
                {markAllRead.isPending ? 'Marking…' : 'Mark all read'}
              </button>
            ) : null}
          </div>

          <div className="max-h-80 divide-y divide-gray-50 overflow-y-auto">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No notifications</p>
            ) : (
              notifications.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? MessageSquare;
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.isRead) markRead.mutate(n.id);
                    }}
                    className={`flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-gray-50 ${!n.isRead ? 'bg-indigo-50/40' : ''}`}
                  >
                    <span className="mt-0.5 flex-shrink-0 rounded-md bg-gray-100 p-1">
                      <Icon className="h-4 w-4 text-gray-600" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm ${!n.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                          {n.title}
                        </p>
                        {!n.isRead ? <span className="h-2 w-2 flex-shrink-0 rounded-full bg-indigo-500" /> : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{n.body}</p>
                      <p className="mt-1 text-[11px] text-gray-400">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-gray-100 bg-gray-50 px-4 py-2">
            <a
              href="/notifications"
              className="block w-full py-1 text-center text-xs font-medium text-indigo-600 hover:underline"
            >
              View all notifications
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
