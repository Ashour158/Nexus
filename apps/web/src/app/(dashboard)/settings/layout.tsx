'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Menu, Search, X } from 'lucide-react';
import { SETUP_CATEGORIES, SETUP_ITEMS } from '@/config/setup-registry';
import { cn } from '@/lib/cn';

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/settings';
  const [query, setQuery] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  const activeItem = useMemo(
    () => SETUP_ITEMS.find((item) => isActive(item.href)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname]
  );

  const NavContent = (
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
                      onClick={() => setMobileNavOpen(false)}
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
  );

  const SearchBox = (
    <div className="relative">
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
  );

  return (
    <div className="flex min-h-full items-start gap-0">
      {/* Desktop category rail */}
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
          <div className="mt-3">{SearchBox}</div>
        </div>
        {NavContent}
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile category selector — opens the rail as a drawer on <md */}
        <div className="sticky top-16 z-10 border-b border-outline-variant bg-surface/95 px-4 py-2 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm font-medium text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-haspopup="dialog"
            aria-expanded={mobileNavOpen}
          >
            <Menu className="h-4 w-4 shrink-0 text-on-surface-variant" />
            <span className="flex-1 truncate text-start">{activeItem?.label ?? 'Setup menu'}</span>
            <span className="text-xs text-on-surface-variant">Browse</span>
          </button>
        </div>

        {/* Off-canvas drawer (always mounted so it can slide; respects reduced motion) */}
        <div
          className={cn('fixed inset-0 z-40 md:hidden', mobileNavOpen ? '' : 'pointer-events-none')}
          role="dialog"
          aria-modal="true"
          aria-label="Setup navigation"
          aria-hidden={!mobileNavOpen}
        >
          <div
            className={cn(
              'absolute inset-0 bg-on-surface/40 motion-safe:transition-opacity motion-safe:duration-200',
              mobileNavOpen ? 'opacity-100' : 'opacity-0'
            )}
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div
            className={cn(
              'absolute inset-y-0 start-0 flex w-[85%] max-w-sm flex-col bg-surface shadow-modal motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-in-out',
              mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
            )}
          >
            <div className="flex items-center justify-between border-b border-outline-variant px-4 py-4">
              <h2 className="text-lg font-bold text-on-surface">Setup</h2>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-high focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b border-outline-variant px-4 py-3">{SearchBox}</div>
            <div className="flex-1 overflow-y-auto">{NavContent}</div>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
