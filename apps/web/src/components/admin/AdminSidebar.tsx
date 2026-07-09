'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ADMIN_GROUPS } from '@/config/admin-registry';

export function AdminSidebar() {
  const pathname = usePathname() ?? '/admin';

  const initialExpanded = useMemo(() => {
    const state: Record<string, boolean> = {};
    ADMIN_GROUPS.forEach((group) => {
      state[group.id] = group.features.some(
        (f) => pathname === f.href || pathname.startsWith(`${f.href}/`)
      );
    });
    // Always open the System & Ops group by default (it holds the overview).
    state['system-ops'] = state['system-ops'] || pathname === '/admin';
    return state;
  }, [pathname]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(initialExpanded);

  useEffect(() => {
    const active = ADMIN_GROUPS.find((group) =>
      group.features.some((f) => pathname === f.href || pathname.startsWith(`${f.href}/`))
    );
    if (active) {
      setExpanded((prev) => (prev[active.id] ? prev : { ...prev, [active.id]: true }));
    }
  }, [pathname]);

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-gray-800 bg-gray-900 text-white">
      <div className="border-b border-gray-800 px-5 py-4">
        <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Control Center</p>
        <Link href="/admin" className="mt-1 block text-lg font-semibold hover:text-blue-300">
          NEXUS Admin
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {ADMIN_GROUPS.map((group) => {
          const GroupIcon = group.icon;
          const isExpanded = expanded[group.id] ?? false;
          return (
            <div key={group.id} className="mb-1">
              <button
                type="button"
                onClick={() => toggle(group.id)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
                aria-expanded={isExpanded}
                aria-controls={`admin-group-${group.id}`}
              >
                <GroupIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left">{group.label}</span>
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              <div
                id={`admin-group-${group.id}`}
                className={isExpanded ? 'mt-0.5 space-y-0.5' : 'hidden'}
              >
                {group.features.map((feature) => {
                  const Icon = feature.icon;
                  const active =
                    pathname === feature.href || pathname.startsWith(`${feature.href}/`);
                  return (
                    <Link
                      key={feature.id}
                      href={feature.href}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                        active ? 'bg-blue-600 text-white' : 'text-gray-200 hover:bg-gray-800'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{feature.label}</span>
                      {feature.placeholder ? (
                        <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-300">
                          soon
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-gray-800 p-3">
        <Link
          href="/"
          className="block rounded-lg px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-800"
        >
          &larr; Back to NEXUS
        </Link>
      </div>
    </aside>
  );
}
