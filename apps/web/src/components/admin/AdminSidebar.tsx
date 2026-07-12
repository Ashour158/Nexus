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
    <aside className="flex h-screen w-72 flex-col border-r border-outline-variant bg-inverse-surface text-white">
      <div className="border-b border-outline-variant px-5 py-4">
        <p className="text-xs uppercase tracking-[0.2em] text-on-surface-variant">Control Center</p>
        <Link href="/admin" className="mt-1 block text-lg font-semibold hover:text-primary">
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
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-outline"
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
                        active ? 'bg-primary text-white' : 'text-outline hover:bg-surface-container-highest'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{feature.label}</span>
                      {feature.placeholder ? (
                        <span className="rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-outline">
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

      <div className="border-t border-outline-variant p-3">
        <Link
          href="/"
          className="block rounded-lg px-3 py-2 text-sm text-outline transition-colors hover:bg-surface-container-highest"
        >
          &larr; Back to NEXUS
        </Link>
      </div>
    </aside>
  );
}
