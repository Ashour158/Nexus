'use client';

import { Bell, CheckCircle2, MessageSquare, Phone, Trophy, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Notification {
  id: string;
  type: 'deal_updated' | 'lead_assigned' | 'mention' | 'task_due' | 'deal_won';
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  link?: string;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  { id: '1', type: 'deal_won', title: 'Deal Won', body: 'Acme Corp - $45,000 closed by Carlos Mendez', read: false, createdAt: new Date(Date.now() - 3600000).toISOString(), link: '/deals/1' },
  { id: '2', type: 'lead_assigned', title: 'New Lead Assigned', body: 'TechStart Inc assigned to you by Sofia Rodriguez', read: false, createdAt: new Date(Date.now() - 7200000).toISOString(), link: '/leads/2' },
  { id: '3', type: 'deal_updated', title: 'Deal Amount Changed', body: 'Global Corp deal updated from $20K to $35K', read: false, createdAt: new Date(Date.now() - 10800000).toISOString(), link: '/deals/3' },
  { id: '4', type: 'task_due', title: 'Task Due Today', body: 'Follow up with Nina Volkov at 3:00 PM', read: true, createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: '5', type: 'mention', title: 'You were mentioned', body: 'Marcus Chen mentioned you in Acme deal notes', read: true, createdAt: new Date(Date.now() - 172800000).toISOString() },
];

const TYPE_ICON = {
  deal_won: Trophy,
  lead_assigned: UserPlus,
  deal_updated: CheckCircle2,
  task_due: Phone,
  mention: MessageSquare,
} as const;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

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
              <button onClick={markAllRead} className="text-xs font-medium text-blue-600 hover:underline">
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-80 divide-y divide-gray-50 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No notifications</p>
            ) : (
              notifications.map((n) => {
                const Icon = TYPE_ICON[n.type];
                return (
                  <div
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={`flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-gray-50 ${!n.read ? 'bg-blue-50/40' : ''}`}
                  >
                    <span className="mt-0.5 flex-shrink-0 rounded-md bg-gray-100 p-1">
                      <Icon className="h-4 w-4 text-gray-600" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-sm ${!n.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                          {n.title}
                        </p>
                        {!n.read ? <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" /> : null}
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
            <button className="w-full py-1 text-xs font-medium text-blue-600 hover:underline">View all notifications</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
