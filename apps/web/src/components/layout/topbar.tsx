'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import {
  useMarkAllNotificationsRead,
  useNotifications,
  useUnreadNotificationsCount,
} from '@/hooks/use-notifications';
import { useRealtimeNotifications } from '@/hooks/use-realtime';
import { formatDateTime } from '@/lib/format';
import {
  BellIcon,
  ChevronDownIcon,
  LogOutIcon,
  MenuIcon,
  SearchIcon,
  SettingsIcon,
  UsersIcon,
} from '@/components/ui/icons';

/**
 * Top navigation bar. Shows breadcrumbs derived from the current pathname,
 * a command-palette trigger (⌘K), a notifications bell and a user menu.
 */

interface Crumb {
  label: string;
  href: string;
}

const LABEL_OVERRIDES: Record<string, string> = {
  deals: 'Deals',
  new: 'New',
  edit: 'Edit',
  contacts: 'Contacts',
  accounts: 'Accounts',
  leads: 'Leads',
  activities: 'Activities',
  quotes: 'Quotes',
  invoices: 'Invoices',
  settings: 'Settings',
  login: 'Login',
};

function toCrumbs(pathname: string): Crumb[] {
  const segments = pathname
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !(s.startsWith('(') && s.endsWith(')')));
  const crumbs: Crumb[] = [];
  let acc = '';
  for (const seg of segments) {
    acc += `/${seg}`;
    const lower = seg.toLowerCase();
    const override = LABEL_OVERRIDES[lower];
    if (override) {
      crumbs.push({ label: override, href: acc });
    } else if (/^[0-9a-z]{20,}$/i.test(seg)) {
      // Looks like a cuid / id — shorten it.
      crumbs.push({ label: `${seg.slice(0, 6)}…`, href: acc });
    } else {
      crumbs.push({
        label: seg.charAt(0).toUpperCase() + seg.slice(1),
        href: acc,
      });
    }
  }
  return crumbs;
}

export function Topbar(): ReactElement {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const setMobileOpen = useUiStore((s) => s.setSidebarOpenOnMobile);
  const { userId, tenantId, clearSession } = useAuthStore((s) => ({
    userId: s.userId,
    tenantId: s.tenantId,
    clearSession: s.clearSession,
  }));

  const crumbs = toCrumbs(pathname);

  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const unreadLocal = useUiStore((s) => s.unreadNotifications);
  const setUnreadLocal = useUiStore((s) => s.setUnreadNotifications);

  const notificationsQuery = useNotifications(5);
  const unreadQuery = useUnreadNotificationsCount();
  const markAllRead = useMarkAllNotificationsRead();
  useRealtimeNotifications();

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [menuOpen]);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (!notifRef.current) return;
      if (!notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [notifOpen]);

  useEffect(() => {
    if (typeof unreadQuery.data?.count === 'number') {
      setUnreadLocal(unreadQuery.data.count);
    }
  }, [unreadQuery.data?.count, setUnreadLocal]);

  const onLogout = () => {
    clearSession();
    setMenuOpen(false);
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="Open navigation"
      >
        <MenuIcon size={18} />
      </button>

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
        <Link
          href="/"
          className="truncate text-sm text-slate-500 hover:text-slate-900"
        >
          Home
        </Link>
        {crumbs.map((c, i) => (
          <span key={c.href} className="flex items-center gap-1">
            <span className="text-slate-300">/</span>
            <Link
              href={c.href}
              className={cn(
                'truncate text-sm',
                i === crumbs.length - 1
                  ? 'font-semibold text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              )}
            >
              {c.label}
            </Link>
          </span>
        ))}
      </nav>

      {/* Command palette trigger (placeholder) */}
      <div className="ml-auto hidden md:block">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
          aria-label="Open command palette"
          title="Command palette"
          // eslint-disable-next-line no-alert
          onClick={() => alert('Command palette coming soon')}
        >
          <SearchIcon size={14} />
          <span>Search…</span>
          <kbd className="ml-4 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Notifications */}
      <div ref={notifRef} className="relative md:ml-2">
        <button
          type="button"
          aria-label="Notifications"
          onClick={() => setNotifOpen((v) => !v)}
          className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100"
        >
          <BellIcon size={18} />
          {unreadLocal > 0 ? (
            <span className="absolute right-0.5 top-0.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadLocal > 99 ? '99+' : unreadLocal}
            </span>
          ) : null}
        </button>
        {notifOpen ? (
          <div className="absolute right-0 mt-1 w-80 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              <button
                type="button"
                className="text-xs font-medium text-brand-700 hover:underline"
                onClick={async () => {
                  await markAllRead.mutateAsync();
                  setUnreadLocal(0);
                }}
              >
                Mark all read
              </button>
            </div>
            <div className="max-h-80 overflow-auto">
              {(notificationsQuery.data?.data ?? []).map((n) => (
                <Link
                  key={n.id}
                  href={n.actionUrl ?? '/notifications'}
                  onClick={() => setNotifOpen(false)}
                  className="block border-b border-slate-50 px-3 py-2 hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-slate-900">{n.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{n.body}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{formatDateTime(n.createdAt)}</p>
                </Link>
              ))}
              {(notificationsQuery.data?.data ?? []).length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-500">No notifications.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* User menu */}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
            {(userId ?? 'NX').slice(0, 2).toUpperCase()}
          </span>
          <ChevronDownIcon size={14} />
        </button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 mt-1 w-56 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
          >
            <div className="border-b border-slate-100 px-3 py-2">
              <div className="truncate text-sm font-semibold text-slate-900">
                {userId ?? 'Not signed in'}
              </div>
              <div className="truncate text-xs text-slate-500">
                {tenantId ?? 'No tenant'}
              </div>
            </div>
            <Link
              href="/settings/profile"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              role="menuitem"
            >
              <UsersIcon size={14} /> Profile
            </Link>
            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              role="menuitem"
            >
              <SettingsIcon size={14} /> Settings
            </Link>
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              role="menuitem"
            >
              <LogOutIcon size={14} /> Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
