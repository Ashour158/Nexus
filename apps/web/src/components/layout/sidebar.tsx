'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactElement } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Database,
  Plus,
  Settings,
  ShieldCheck,
  Users,
  X,
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
  /** True when the System Map classifies this module as `preview`. */
  preview?: boolean;
};

type NavGroup = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

/**
 * Quiet lifecycle label distinguishing Preview modules from operationally-ready
 * ones. Deliberately subdued — tertiary tonal pair rather than warning/error —
 * because this is information, not an alarm. The literal word "Preview" is part
 * of the accessible name, so the meaning is never colour-only (WCAG 1.4.1).
 */
function PreviewPill() {
  return (
    <span
      className="pill shrink-0 bg-tertiary-container px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-on-tertiary-container opacity-80"
      title="Preview — not yet operationally complete"
    >
      Preview
    </span>
  );
}

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
        preview: module.status === 'preview',
      })),
  })),
  {
    label: 'Workspace',
    icon: ShieldCheck,
    items: [
      { href: '/org-chart', label: 'Org Chart', icon: Users },
      { href: '/system-map', label: 'System Map', icon: Database },
      { href: '/settings', label: 'Setup', icon: Settings },
    ],
  },
].filter((group) => group.items.length > 0);

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps): ReactElement {
  const pathname = usePathname() ?? '/';
  const toggle = useUiStore((s) => s.toggleSidebar);
  const displayName = useAuthStore((s) => s.displayName);
  const email = useAuthStore((s) => s.email);
  const tenantId = useAuthStore((s) => s.tenantId);
  // Human-readable identity only — never the opaque `userId` cuid.
  const identityLabel = displayName || email || 'User';
  // Admin nav visibility must accept SUPER_ADMIN (and the `*` permission), not
  // just a literal 'admin' role — otherwise the super admin loses admin nav.
  const userIsAdmin = useAuthStore((s) => s.isAdmin)();

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));

  /**
   * Progressive disclosure: a first-time user should not meet all 60+ modules
   * at once. Default expansion is therefore narrow — a group opens by default
   * ONLY when it contains the active route. Everything else (including any
   * group made up entirely of Preview modules, which is never a starting point)
   * stays collapsed until the user opens it. No navigation is removed; this is
   * purely the default disclosure state, and every group is one click away.
   */
  const defaultExpanded = (group: NavGroup): boolean => {
    // The group holding the active route always wins — the user is already
    // there, so it must be expanded (this outranks the preview rule below,
    // otherwise the current location would be hidden from its own nav).
    if (group.items.some((item) => isActive(item.href))) return true;
    // An all-Preview group is never a sensible starting point: stays collapsed.
    if (group.items.every((item) => item.preview)) return false;
    // Every other group collapses by default too.
    return false;
  };

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAV_GROUPS.forEach((g) => {
      initial[g.label] = defaultExpanded(g);
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
        <div className="fixed inset-0 z-30 bg-on-surface/40 md:hidden" onClick={onMobileClose} aria-hidden="true" />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-40 flex flex-col border-e border-outline-variant bg-surface transition-[width] duration-300 ease-in-out',
          'md:translate-x-0',
          'md:w-80',
          mobileOpen ? 'translate-x-0 w-80' : '-translate-x-full w-80 md:translate-x-0'
        )}
        aria-label="Main sidebar"
      >
        <div className="mb-4 flex items-center justify-between px-8 pb-4 pt-6">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-on-primary shadow-sm shadow-primary/30">
              N
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold tracking-tight text-on-surface">Nexus CRM</span>
              <span className="block text-xs font-semibold text-on-surface-variant">Enterprise CRM</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onMobileClose}
            className="rounded p-1.5 text-on-surface-variant md:hidden"
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
              if (item.href === '/settings/users' && !userIsAdmin) return false;
              if (item.adminOnly && !userIsAdmin) return false;
              return true;
            });
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.label} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  className="flex w-full items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant transition hover:bg-surface-container-high"
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
                            ? 'bg-primary-container font-semibold text-on-primary-container'
                            : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                        )}
                        aria-current={active ? 'page' : undefined}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.preview ? <PreviewPill /> : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-outline-variant p-4">
          <Link
            href="/contacts"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-on-primary shadow-sm shadow-primary/20 transition-transform active:scale-95"
          >
            <Plus className="h-4 w-4" />
            New Record
          </Link>
          <div className="mt-6 flex items-center gap-3 px-2">
            <Avatar name={identityLabel} size="md" />
            <div className="min-w-0 overflow-hidden">
              <p className="truncate text-sm font-bold text-on-surface">{identityLabel}</p>
              <p className="truncate text-xs text-on-surface-variant">
                {userIsAdmin ? 'Administrator' : tenantId ?? 'Default Tenant'}
              </p>
            </div>
          </div>
          <Link
            href="/settings"
            className="mt-3 flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-primary hover:bg-primary-container hover:text-on-primary-container"
          >
            <Settings className="h-3.5 w-3.5" />
            Setup
          </Link>
        </div>
      </aside>
    </>
  );
}
