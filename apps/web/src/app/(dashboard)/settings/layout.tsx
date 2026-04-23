'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/settings/pipelines', label: 'Pipelines' },
  { href: '/settings/users', label: 'Users' },
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/workflows', label: 'Workflows' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 px-6 pt-4">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              pathname?.startsWith(tab.href)
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
