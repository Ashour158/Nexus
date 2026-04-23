'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactElement } from 'react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import {
  BriefcaseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  LayoutIcon,
  PhoneIcon,
  ReceiptIcon,
  SettingsIcon,
  UsersIcon,
  XIcon,
  type IconProps,
} from '@/components/ui/icons';

/**
 * Left-hand sidebar (Section 50 layout). Sections:
 *  1. CRM — Deals, Contacts, Accounts, Leads, Activities
 *  2. Finance — Quotes, Invoices
 *  3. Platform — Settings
 *
 * Collapsed/expanded state is stored in `useUiStore` so other parts of the
 * shell (Topbar, content area) can react. Mobile: slides in from the left
 * over a darkened backdrop.
 */

interface NavItem {
  label: string;
  href: string;
  Icon: (p: IconProps) => ReactElement;
  /** Optional numeric badge (e.g. overdue counts). Falsy values hide it. */
  badge?: number | null;
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    heading: 'CRM',
    items: [
      { label: 'Deals', href: '/deals', Icon: BriefcaseIcon },
      { label: 'Contacts', href: '/contacts', Icon: UsersIcon },
      { label: 'Accounts', href: '/accounts', Icon: LayoutIcon },
      { label: 'Leads', href: '/leads', Icon: PhoneIcon },
      { label: 'Activities', href: '/activities', Icon: FileTextIcon },
    ],
  },
  {
    heading: 'Finance',
    items: [
      { label: 'Quotes', href: '/quotes', Icon: FileTextIcon },
      { label: 'Invoices', href: '/invoices', Icon: ReceiptIcon },
    ],
  },
  {
    heading: 'Platform',
    items: [{ label: 'Settings', href: '/settings', Icon: SettingsIcon }],
  },
];

function initialsFor(userId: string | null): string {
  if (!userId) return 'NX';
  return userId.slice(0, 2).toUpperCase();
}

export interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps): ReactElement {
  const pathname = usePathname() ?? '/';
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const setCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const mobileOpen = useUiStore((s) => s.sidebarOpenOnMobile);
  const setMobileOpen = useUiStore((s) => s.setSidebarOpenOnMobile);

  const { tenantId, userId } = useAuthStore((s) => ({
    tenantId: s.tenantId,
    userId: s.userId,
  }));

  // Keyboard shortcut: Cmd/Ctrl + B
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  // Auto-collapse under the `lg` breakpoint (Tailwind default: 1024px).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const apply = () => setCollapsed(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [setCollapsed]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
        />
      ) : null}

      <aside
        data-collapsed={collapsed || undefined}
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-white transition-[width,transform] duration-200',
          collapsed ? 'w-16' : 'w-60',
          mobileOpen
            ? 'translate-x-0'
            : 'lg:translate-x-0 max-lg:-translate-x-full',
          className
        )}
      >
        {/* Brand */}
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-3">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold text-slate-900"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white">
              N
            </span>
            {!collapsed ? <span>Nexus</span> : null}
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Close menu"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav
          className="flex-1 overflow-y-auto px-2 py-3"
          aria-label="Primary navigation"
        >
          {SECTIONS.map((section) => (
            <div key={section.heading} className="mb-4">
              {!collapsed ? (
                <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {section.heading}
                </div>
              ) : (
                <div className="mx-2 my-2 border-t border-slate-100" />
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'group flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors',
                          active
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        )}
                      >
                        <item.Icon size={18} />
                        {!collapsed ? (
                          <span className="flex-1 truncate">{item.label}</span>
                        ) : null}
                        {!collapsed && item.badge ? (
                          <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer — user + collapse toggle */}
        <div className="border-t border-slate-200 p-3">
          <div
            className={cn(
              'flex items-center gap-2 rounded-md p-2',
              collapsed ? 'justify-center' : 'bg-slate-50'
            )}
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {initialsFor(userId)}
            </span>
            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">
                  {userId ?? 'Not signed in'}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {tenantId ?? 'No tenant'}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggle}
            className="mt-2 hidden w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 lg:inline-flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title="Toggle (⌘B / Ctrl+B)"
          >
            {collapsed ? (
              <ChevronRightIcon size={14} />
            ) : (
              <>
                <ChevronLeftIcon size={14} />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
