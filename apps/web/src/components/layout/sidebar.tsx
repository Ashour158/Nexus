'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactElement } from 'react';
import {
  Activity,
  BarChart2,
  Briefcase,
  Building2,
  CalendarIcon,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Database,
  DollarSign,
  FileText,
  Globe,
  LayoutDashboard,
  Lock,
  Map,
  Mail,
  MessageCircle,
  MessageSquare,
  Package,
  Percent,
  Settings2,
  ShieldCheck,
  Target,
  TrendingUp,
  Trophy,
  Users,
  X,
  Zap,
  GitBranch,
  Bot,
  BookOpenText,
  UserCog,
  Layers,
  CreditCard,
  Trash2,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { Avatar } from '@/components/ui/avatar';
import { CRM_MODULE_GROUPS } from '@/config/module-registry';

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

type NavGroup = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

const LEGACY_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Sales',
    icon: TrendingUp,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/leads', label: 'Leads', icon: Target },
      { href: '/deals', label: 'Deals', icon: Briefcase },
      { href: '/pipeline', label: 'Pipeline', icon: Layers },
      { href: '/quotes', label: 'Quotes', icon: FileText },
      { href: '/forecast', label: 'Forecast', icon: Percent },
    ],
  },
  {
    label: 'Customer',
    icon: Users,
    items: [
      { href: '/contacts', label: 'Contacts', icon: Users },
      { href: '/accounts', label: 'Accounts', icon: Building2 },
      { href: '/activities', label: 'Activities', icon: Activity },
      { href: '/calendar', label: 'Calendar', icon: CalendarIcon },
    ],
  },
  {
    label: 'Product',
    icon: Package,
    items: [
      { href: '/products', label: 'Products', icon: Package },
    ],
  },
  {
    label: 'Revenue',
    icon: DollarSign,
    items: [
      { href: '/invoices', label: 'Invoices', icon: FileText },
      { href: '/contracts', label: 'Contracts', icon: CreditCard },
      { href: '/commissions', label: 'Commissions', icon: DollarSign },
      { href: '/incentives', label: 'Incentives', icon: Trophy },
    ],
  },
  {
    label: 'Analytics',
    icon: BarChart2,
    items: [
      { href: '/reports', label: 'Reports', icon: FileText },
      { href: '/analytics', label: 'Analytics', icon: BarChart2 },
      { href: '/analytics/dashboards', label: 'Dashboards', icon: LayoutDashboard },
      { href: '/analytics/reports/builder', label: 'Report Builder', icon: BarChart2 },
      { href: '/analytics/win-loss', label: 'Win / Loss', icon: CheckSquare },
      { href: '/analytics/competitors', label: 'Competitors', icon: ShieldCheck },
    ],
  },
  {
    label: 'Operations',
    icon: Settings2,
    items: [
      { href: '/approvals', label: 'Approvals', icon: ShieldCheck },
      { href: '/workflows', label: 'Workflows', icon: GitBranch },
      { href: '/cadences', label: 'Cadences', icon: Zap },
      { href: '/territories', label: 'Territories', icon: Map },
    ],
  },
  {
    label: 'Communications',
    icon: Mail,
    items: [
      { href: '/inbox', label: 'Inbox', icon: Mail },
      { href: '/messages/whatsapp', label: 'Messages', icon: MessageCircle },
    ],
  },
  {
    label: 'Support',
    icon: MessageSquare,
    items: [
      { href: '/knowledge', label: 'Knowledge', icon: BookOpenText },
      { href: '/chatbot', label: 'Chatbot', icon: Bot },
      { href: '/portal/settings', label: 'Portal', icon: Globe },
    ],
  },
  {
    label: 'Settings',
    icon: Settings2,
    items: [
      { href: '/settings', label: 'Settings', icon: Settings2 },
      { href: '/settings/integrations', label: 'Integrations', icon: Zap },
      { href: '/settings/users', label: 'Users', icon: UserCog },
      { href: '/roles', label: 'Roles', icon: Lock },
      { href: '/settings/data-privacy', label: 'Data Privacy', icon: Lock },
      { href: '/settings/gdpr', label: 'GDPR', icon: ShieldCheck },
      { href: '/recycle-bin', label: 'Recycle Bin', icon: Trash2 },
    ],
  },
];

// Admin consolidation: the many leaf links that used to live under the
// "Administration" and "Configuration & Data" groups now live inside the single
// grouped Admin Panel (/admin). Collapse them into one "Admin" entry here and
// keep only the couple of most-used direct links that non-admins also use.
const ADMIN_GROUP_IDS = new Set(['administration', 'configuration']);

const NAV_GROUPS: NavGroup[] = [
  ...CRM_MODULE_GROUPS.filter((group) => !ADMIN_GROUP_IDS.has(group.id)).map((group) => ({
    label: group.label,
    icon: group.icon,
    items: group.modules
      .filter((module) => module.sidebar)
      .map((module) => ({
        href: module.href,
        label: module.label,
        icon: module.icon,
        adminOnly: module.adminOnly,
      })),
  })),
  {
    label: 'Admin',
    icon: ShieldCheck,
    items: [
      { href: '/org-chart', label: 'Org Chart', icon: Users },
      { href: '/system-map', label: 'System Map', icon: Database },
      { href: '/admin', label: 'Admin Panel', icon: ShieldCheck, adminOnly: true },
    ],
  },
].filter((group) => group.items.length > 0);

void LEGACY_NAV_GROUPS;

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps): ReactElement {
  const pathname = usePathname() ?? '/';
  const toggle = useUiStore((s) => s.toggleSidebar);
  const roles = useAuthStore((s) => s.roles);
  const userId = useAuthStore((s) => s.userId);
  const tenantId = useAuthStore((s) => s.tenantId);

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAV_GROUPS.forEach((g) => {
      initial[g.label] = g.items.some((item) => isActive(item.href));
    });
    return initial;
  });

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = { ...prev };
      NAV_GROUPS.forEach((g) => {
        if (g.items.some((item) => isActive(item.href))) {
          next[g.label] = true;
        }
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <>
      {mobileOpen ? (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onMobileClose} aria-hidden="true" />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-40 flex flex-col border-e transition-[width] duration-300 ease-in-out',
          'md:translate-x-0',
          'md:w-80',
          mobileOpen ? 'translate-x-0 w-80' : '-translate-x-full w-80 md:translate-x-0'
        )}
        style={{ backgroundColor: 'var(--sidebar-bg)', borderColor: '#e2e8f0' }}
        aria-label="Main sidebar"
      >
        <div className="mb-4 flex items-center justify-between px-8 pb-4 pt-6">
          <Link href="/dashboard" className="min-w-0" style={{ color: 'var(--text-primary)' }}>
            <span className="block text-xl font-bold tracking-tight text-[#005baf]">Nexus CRM</span>
            <span className="block text-xs font-semibold text-slate-500">Enterprise CRM</span>
          </Link>
          <button
            type="button"
            onClick={onMobileClose}
            className="rounded p-1.5 md:hidden"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-1" aria-label="Primary navigation">
          {NAV_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            const isExpanded = expandedGroups[group.label] ?? false;

            const visibleItems = group.items.filter((item) => {
              if (item.href === '/settings/users' && !roles.includes('admin')) return false;
              if (item.adminOnly && !roles.includes('admin')) return false;
              return true;
            });
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.label} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="flex w-full items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wider transition hover:bg-slate-50"
                  style={{ color: 'var(--text-muted)' }}
                  aria-expanded={isExpanded}
                  aria-controls={`group-${group.label}`}
                >
                  <GroupIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 text-left">{group.label}</span>
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
                <div
                  id={`group-${group.label}`}
                  className={cn('mt-0.5 space-y-0.5 overflow-hidden transition-all', !isExpanded && 'hidden')}
                >
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onMobileClose}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition',
                          active
                            ? 'bg-blue-50/80 font-semibold text-[#005baf]'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        )}
                        style={
                          active
                            ? {
                                backgroundColor: '#eef6ff',
                                color: '#005baf',
                              }
                            : {}
                        }
                        aria-current={active ? 'page' : undefined}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-slate-100 p-4">
          <Link
            href="/contacts"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#137fec] px-4 py-3 text-sm font-bold text-white transition-transform active:scale-95"
          >
            <Plus className="h-4 w-4" />
            New Record
          </Link>
          <div className="mt-6 flex items-center gap-3 px-2">
            <Avatar name={userId ?? 'User'} size="md" />
            <div className="min-w-0 overflow-hidden">
              <p className="truncate text-sm font-bold text-slate-900">
                {userId ?? 'User'}
              </p>
              <p className="truncate text-xs text-slate-500">
                {roles.includes('admin') ? 'Administrator' : tenantId ?? 'Default Tenant'}
              </p>
            </div>
          </div>
          {roles.includes('admin') ? (
            <Link
              href="/admin"
              className="mt-3 flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-[#005baf] hover:bg-blue-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin Panel
            </Link>
          ) : null}
        </div>
      </aside>
    </>
  );
}
