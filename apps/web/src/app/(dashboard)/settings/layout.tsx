'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GitMerge, ShieldCheck } from 'lucide-react';

const TABS = [
  { href: '/settings/profile', label: 'Profile' },
  { href: '/settings/company', label: 'Company' },
  { href: '/settings/org-structure', label: 'Org Structure' },
  { href: '/settings/integrations', label: 'Integrations' },
  { href: '/settings/users', label: 'Users' },
  { href: '/settings/pipelines', label: 'Pipelines' },
  { href: '/settings/data-privacy', label: 'Data Privacy' },
  { href: '/settings/gdpr', label: 'GDPR' },
  { href: '/settings/duplicates', label: 'Duplicate Records', icon: GitMerge },
  { href: '/settings/sso', label: 'Single Sign-On' },
  { href: '/settings/workflows', label: 'Workflows' },
  { href: '/settings/quote-automation', label: 'Quote Automation' },
  { href: '/settings/scoring-rules', label: 'Scoring Rules' },
  { href: '/settings/custom-fields', label: 'Custom Fields' },
  { href: '/settings/field-permissions', label: 'Field Permissions', icon: ShieldCheck },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/migration', label: 'Migration' },
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
            <span className="inline-flex items-center gap-1.5">
              {'icon' in tab && tab.icon ? <tab.icon className="h-3.5 w-3.5" /> : null}
              {tab.label}
            </span>
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
