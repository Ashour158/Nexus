'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Briefcase, Users, Activity, Settings } from 'lucide-react';
import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/activities', label: 'Activity', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname() ?? '/';

  return (
    <nav className="safe-area-inset-bottom fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant bg-surface/95 backdrop-blur-md md:hidden">
      <div className="grid h-16 grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors',
                active ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'
              )}
            >
              <span
                className={cn(
                  'flex h-8 w-12 items-center justify-center rounded-full transition-colors',
                  active && 'bg-primary-container'
                )}
              >
                <Icon className={cn('h-5 w-5', active && 'text-on-primary-container')} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
