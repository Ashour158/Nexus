'use client';

import { useState } from 'react';
import { Bell, Check, CheckCheck, ExternalLink, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type NotificationItem,
} from '@/hooks/use-notifications';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';

export default function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const limit = 50;

  const { data, isLoading, refetch, isFetching } = useNotifications(limit);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const notifications = data?.data ?? [];
  const filtered = filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold text-on-surface">Notifications</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-white">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-lg border border-outline-variant p-2 text-on-surface-variant transition hover:bg-surface-container-low"
            title="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </button>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-medium text-on-surface transition hover:bg-surface-container-low"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex gap-2 border-b border-outline-variant">
        {(['all', 'unread'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={cn(
              'px-4 py-2 text-sm font-medium capitalize transition',
              filter === tab
                ? 'border-b-2 border-primary text-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-on-surface-variant">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-on-surface-variant">
          <Bell className="h-10 w-10 opacity-40" />
          <p>{filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}</p>
        </div>
      ) : (
        <ul className="divide-y divide-outline-variant rounded-xl border border-outline-variant bg-surface">
          {filtered.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              onMarkRead={() => markRead.mutate(n.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationRow({
  notification: n,
  onMarkRead,
}: {
  notification: NotificationItem;
  onMarkRead: () => void;
}) {
  return (
    <li className={cn('flex items-start gap-3 p-4 transition hover:bg-surface-container-low', !n.isRead && 'bg-primary-container/40')}>
      {!n.isRead && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      )}
      {n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', n.isRead ? 'text-on-surface' : 'font-medium text-on-surface')}>
          {n.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-sm text-on-surface-variant">{n.body}</p>
        <p className="mt-1 text-xs text-on-surface-variant">{formatDate(n.createdAt)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {n.actionUrl && (
          <Link
            href={n.actionUrl}
            className="rounded p-1 text-on-surface-variant transition hover:text-primary"
            title="View"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        )}
        {!n.isRead && (
          <button
            onClick={onMarkRead}
            className="rounded p-1 text-on-surface-variant transition hover:text-success"
            title="Mark as read"
          >
            <Check className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  );
}
