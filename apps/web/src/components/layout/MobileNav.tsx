'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard',  label: 'Home',     icon: '🏠' },
  { href: '/deals',      label: 'Deals',    icon: '💼' },
  { href: '/contacts',   label: 'Contacts', icon: '👥' },
  { href: '/activities', label: 'Activity', icon: '📋' },
  { href: '/settings',   label: 'Settings', icon: '⚙️' },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-surface dark:bg-surface border-t border-outline-variant dark:border-outline-variant md:hidden z-40">
      <div className="grid grid-cols-5 h-16">
        {NAV_ITEMS.map(item => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
                isActive
                  ? 'text-primary '
                  : 'text-on-surface-variant dark:text-on-surface-variant hover:text-on-surface dark:hover:text-outline'
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
