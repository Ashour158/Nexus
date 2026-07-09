'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { HelpCircle, Menu, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import {
  ChevronDownIcon,
  LogOutIcon,
  SettingsIcon,
  UsersIcon,
} from '@/components/ui/icons';
import { LocaleSwitcher } from '@/components/ui/locale-switcher';
import { GlobalSearch } from '@/components/search/global-search';
import { NotificationBell } from '@/components/notifications/notification-bell';

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
  tasks: 'Tasks',
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
  const pageTitle = crumbs.at(-1)?.label ?? 'Dashboard';

  const [menuOpen, setMenuOpen] = useState(false);
  const [currentLocale, setCurrentLocale] = useState('en');
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const locale =
      document.cookie
        .split('; ')
        .find((c) => c.startsWith('NEXUS_LOCALE='))
        ?.split('=')[1] ?? 'en';
    setCurrentLocale(locale);
  }, []);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    if (menuOpen) {
      document.addEventListener('mousedown', onClickAway);
      document.addEventListener('keydown', onKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const onLogout = () => {
    clearSession();
    // Clear the HttpOnly access-token cookie server-side (client JS cannot clear
    // it) as well as the JS-readable session flag (RR-H10). Fire-and-forget; the
    // redirect to /login happens regardless.
    void fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    document.cookie = 'nexus_session=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT';
    setMenuOpen(false);
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/90 sm:px-6 lg:px-8">
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 md:hidden"
        aria-label="Open navigation"
        title="Open navigation"
      >
        <Menu className="h-5 w-5 text-gray-600" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-4 xl:gap-6">
        <div className="min-w-[120px]">
          <h2 className="truncate text-lg font-semibold tracking-tight text-slate-900">{pageTitle}</h2>
          <nav aria-label="Breadcrumb" className="mt-0.5 flex min-w-0 items-center gap-1">
            <Link
              href="/"
              className="truncate text-xs font-medium text-slate-400 hover:text-slate-700"
            >
              Home
            </Link>
            {crumbs.map((c, i) => (
              <span key={c.href} className="flex items-center gap-1">
                <span className="text-slate-300">/</span>
                <Link
                  href={c.href}
                  aria-current={i === crumbs.length - 1 ? 'page' : undefined}
                  className={cn(
                    'truncate text-xs font-medium',
                    i === crumbs.length - 1
                      ? 'text-slate-700'
                      : 'text-slate-400 hover:text-slate-700'
                  )}
                >
                  {c.label}
                </Link>
              </span>
            ))}
          </nav>
        </div>
        <div className="hidden min-w-[280px] max-w-[460px] flex-1 xl:block">
          <GlobalSearch />
        </div>
      </div>

      <div className="mx-1 hidden h-6 w-px bg-slate-200 xl:block" />
      <div className="hidden md:block xl:hidden">
        <GlobalSearch compact />
      </div>
      {/* RR-H19: the dark-mode toggle is hidden until the design-token migration
          reaches full `dark:` coverage. Only ~17% of surfaces were themed, so
          enabling it produced a broken mixed light/dark UI. Re-add
          `<DarkModeToggle />` here once dark: coverage is complete. */}
      <LocaleSwitcher currentLocale={currentLocale} />
      <NotificationBell />
      <button
        type="button"
        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#005baf]"
        title="Help"
      >
        <HelpCircle className="h-5 w-5" />
      </button>

      {/* User menu */}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account menu"
          title="Account menu"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
            {(userId ?? 'NX').slice(0, 2).toUpperCase()}
          </span>
          <ChevronDownIcon size={14} />
        </button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute end-0 mt-1 w-56 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
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
              aria-label="Settings"
              title="Settings"
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

// RR-H19: exported (not rendered) so it can be dropped back into the topbar once
// the design-token migration reaches full `dark:` coverage. Do NOT render it
// before then — only ~17% of surfaces are themed, so it yields a broken mixed UI.
export function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // RR-H19: honor ONLY an explicit, previously-saved user choice. The removed
    // `prefers-color-scheme: dark` branch used to auto-activate dark mode for any
    // visitor whose OS prefers dark, forcing the broken mixed theme on load with
    // no user action. Dark mode now activates on explicit toggle only.
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.classList.add('dark');
      setIsDark(true);
    }
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#005baf] dark:hover:bg-slate-800"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

