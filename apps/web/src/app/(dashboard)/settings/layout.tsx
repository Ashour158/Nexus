'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { SETUP_CATEGORIES } from '@/config/setup-registry';
import { cn } from '@/lib/cn';

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/settings';
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();

  const categories = useMemo(() => {
    if (!q) return SETUP_CATEGORIES;
    return SETUP_CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          cat.label.toLowerCase().includes(q)
      ),
    })).filter((cat) => cat.items.length > 0);
  }, [q]);

  const isActive = (href: string) =>
    pathname === href || (href !== '/settings' && pathname.startsWith(`${href}/`));

  return (
    <div className="flex min-h-full items-start gap-0">
      <aside
        className="sticky top-0 hidden max-h-screen w-72 shrink-0 flex-col self-start overflow-y-auto border-e border-outline-variant bg-surface-container-low md:flex"
        aria-label="Setup navigation"
      >
        <div className="border-b border-outline-variant px-4 py-4">
          <Link href="/settings" className="block">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
              Nexus
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-on-surface">Setup</h2>
          </Link>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Setup"
              className="w-full rounded-lg border border-outline-variant bg-surface py-2 ps-9 pe-8 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
              aria-label="Search Setup"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-on-surface-variant hover:bg-surface-container-high"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <nav className="flex-1 space-y-4 px-3 py-4">
          {categories.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-on-surface-variant">
              No settings match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            categories.map((category) => {
              const CatIcon = category.icon;
              return (
                <div key={category.id}>
                  <div className="mb-1 flex items-center gap-2 px-2">
                    <CatIcon className="h-3.5 w-3.5 text-on-surface-variant" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                      {category.label}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {category.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          className={cn(
                            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                            active
                              ? 'bg-primary-container font-semibold text-on-primary-container'
                              : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                          )}
                          aria-current={active ? 'page' : undefined}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.isNew ? (
                            <span className="rounded bg-tertiary-container px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-tertiary-container">
                              new
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
