'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactElement } from 'react';
import {
  Activity,
  BarChart2,
  BookOpen,
  Briefcase,
  Building2,
  CalendarIcon,
  CheckSquare,
  DollarSign,
  FileText,
  GitBranch,
  Globe,
  LayoutDashboard,
  Mail,
  Map,
  Package,
  ShieldCheck,
  TrendingUp,
  Users,
  Users2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'My Work',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/deals', label: 'Deals', icon: Briefcase },
      { href: '/contacts', label: 'Contacts', icon: Users },
      { href: '/accounts', label: 'Companies', icon: Building2 },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare },
      { href: '/activities', label: 'Activities', icon: Activity },
      { href: '/calendar', label: 'Calendar', icon: CalendarIcon },
    ],
  },
  {
    label: 'Sales',
    items: [
      { href: '/cadences', label: 'Sequences', icon: Mail },
      { href: '/products', label: 'Products', icon: Package },
      { href: '/documents', label: 'Documents', icon: FileText },
      { href: '/knowledge', label: 'Knowledge', icon: BookOpen },
      { href: '/commissions', label: 'Commissions', icon: DollarSign },
    ],
  },
  {
    label: 'Reports',
    items: [
      { href: '/pipeline/analytics', label: 'Pipeline', icon: TrendingUp },
      { href: '/reports/performance', label: 'Performance', icon: BarChart2 },
      { href: '/reports/manager', label: 'Manager View', icon: Users2 },
      { href: '/territories', label: 'Territories', icon: Map },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/approvals', label: 'Approvals', icon: ShieldCheck },
      { href: '/workflows', label: 'Workflows', icon: GitBranch },
      { href: '/portal/settings', label: 'Portal', icon: Globe },
    ],
  },
];

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps): ReactElement {
  const pathname = usePathname() ?? '/';
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const roles = useAuthStore((s) => s.roles);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onMobileClose, toggle]);

  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <>
      {mobileOpen ? (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onMobileClose} aria-hidden="true" />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-40 flex w-64 flex-col border-e border-gray-200 bg-white transition-transform duration-300 ease-in-out',
          'lg:static lg:translate-x-0 lg:z-auto',
          collapsed ? 'lg:w-16' : 'lg:w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-gray-200 px-3">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-gray-900 text-white">N</span>
            {!collapsed ? <span>Nexus</span> : null}
          </Link>
          <button type="button" onClick={onMobileClose} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden" aria-label="Close sidebar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-2 py-4" aria-label="Primary navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!collapsed ? (
                <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">{group.label}</p>
              ) : null}
              <ul className="space-y-0.5">
                {group.items
                  .filter((item) => item.href !== '/reports/manager' || roles.includes('manager') || roles.includes('admin'))
                  .map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onMobileClose}
                          className={cn(
                            'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                            active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                            collapsed && 'justify-center px-2'
                          )}
                          title={collapsed ? item.label : undefined}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {!collapsed ? item.label : null}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </nav>

        {roles.includes('admin') ? (
          <div className="border-t border-gray-200 p-2">
            <Link href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50">
              <ShieldCheck className="h-4 w-4" />
              {!collapsed ? 'Admin Panel' : null}
            </Link>
          </div>
        ) : null}
      </aside>
    </>
  );
}
