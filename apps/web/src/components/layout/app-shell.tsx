'use client';

import type { ReactElement, ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/ui.store';

export interface AppShellProps {
  children: ReactNode;
  /** Extra classes applied to the scrollable `<main>` content area. */
  className?: string;
}

/**
 * Authenticated shell: Sidebar + Topbar wrap `children`. Uses a CSS transition
 * on `padding-left` to animate the content area as the sidebar collapses from
 * 240px to 64px. Mobile: sidebar becomes an overlay drawer so `<main>` keeps
 * its full width.
 */
export function AppShell({ children, className }: AppShellProps): ReactElement {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const mobileOpen = useUiStore((s) => s.sidebarOpenOnMobile);
  const setMobileOpen = useUiStore((s) => s.setSidebarOpenOnMobile);

  return (
    <div
      data-sidebar-collapsed={collapsed || undefined}
      className="min-h-screen bg-slate-50 text-slate-900"
    >
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div
        className={cn(
          'flex min-h-screen flex-col transition-[padding] duration-200',
          collapsed ? 'lg:ps-16' : 'lg:ps-60'
        )}
      >
        <Topbar />
        <main className={cn('flex-1 px-4 py-6 sm:px-6 lg:px-8', className)}>
          {children}
        </main>
      </div>
    </div>
  );
}
