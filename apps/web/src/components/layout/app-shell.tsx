'use client';

import type { ReactElement, ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { MobileNav } from './mobile-nav';
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
  const mobileOpen = useUiStore((s) => s.sidebarOpenOnMobile);
  const setMobileOpen = useUiStore((s) => s.setSidebarOpenOnMobile);

  return (
    <div
      className="min-h-screen bg-[#f9f9ff] text-slate-900 dark:bg-slate-950 dark:text-slate-100"
    >
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div
        className={cn(
          'flex min-h-screen flex-col transition-[padding] duration-200 md:ps-80'
        )}
      >
        <Topbar />
        <main className={cn('flex-1 px-4 py-6 pb-24 sm:px-6 md:pb-6 lg:px-8', className)}>
          {children}
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
