'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Building2, LayoutDashboard, ScrollText, Settings, ShieldCheck, ToggleLeft, Users } from 'lucide-react';

const ITEMS = [
  { href: '/admin', label: 'Overview', Icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', Icon: Users },
  { href: '/admin/tenants', label: 'Tenants', Icon: Building2 },
  { href: '/admin/roles', label: 'Roles & Permissions', Icon: ShieldCheck },
  { href: '/admin/audit', label: 'Audit Log', Icon: ScrollText },
  { href: '/admin/flags', label: 'Feature Flags', Icon: ToggleLeft },
  { href: '/admin/health', label: 'System Health', Icon: Activity },
  { href: '/admin/settings', label: 'Settings', Icon: Settings },
] as const;

export function AdminSidebar() {
  const pathname = usePathname() ?? '/admin';

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-gray-800 bg-gray-900 text-white">
      <div className="border-b border-gray-800 px-5 py-4">
        <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Control Center</p>
        <h1 className="mt-1 text-lg font-semibold">NEXUS Admin</h1>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-gray-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-800 p-3">
        <Link href="/" className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-800">
          ? Back to NEXUS
        </Link>
      </div>
    </aside>
  );
}
